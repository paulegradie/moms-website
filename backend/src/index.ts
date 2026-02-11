import crypto from "node:crypto";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { google } from "googleapis";

type LockResult = "LOCK_ACQUIRED" | "ALREADY_PROCESSED" | "IN_PROGRESS";

type SquareMoney = {
  amount?: number;
  currency?: string;
};

type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  amount_money?: SquareMoney;
  buyer_email_address?: string;
  note?: string;
  billing_address?: {
    first_name?: string;
    last_name?: string;
  };
};

type SquareOrderLineItem = {
  name?: string;
  variation_name?: string;
  note?: string;
  quantity?: string;
};

type SquareFulfillmentRecipient = {
  display_name?: string;
  email_address?: string;
  phone_number?: string;
};

type SquareOrder = {
  id?: string;
  reference_id?: string;
  line_items?: SquareOrderLineItem[];
  fulfillments?: Array<{
    pickup_details?: {
      recipient?: SquareFulfillmentRecipient;
    };
    shipment_details?: {
      recipient?: SquareFulfillmentRecipient;
    };
  }>;
};

type SquareWebhookEnvelope = {
  event_id?: string;
  id?: string;
  type?: string;
  event_type?: string;
  data?: {
    object?: {
      payment?: SquarePayment;
    };
  };
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secrets = new SecretsManagerClient({});
const secretCache = new Map<string, string>();
const packageMapCache = new Map<string, number>();

const eventTableName = requireEnv("EVENT_TABLE_NAME");
const squareSignatureSecretArn = requireEnv("SQUARE_SIGNATURE_SECRET_ARN");
const googleServiceAccountSecretArn = requireEnv("GOOGLE_SERVICE_ACCOUNT_SECRET_ARN");
const squareAccessTokenSecretArn = requireEnv("SQUARE_ACCESS_TOKEN_SECRET_ARN");
const googleSheetId = requireEnv("GOOGLE_SHEET_ID");
const googleSheetTab = process.env.GOOGLE_SHEET_TAB ?? "Bookings";
const processingLockSeconds = toNumber(process.env.PROCESSING_LOCK_SECONDS, 120);
const ttlDays = toNumber(process.env.EVENT_TTL_DAYS, 90);
const squareApiBaseUrl = process.env.SQUARE_API_BASE_URL ?? "https://connect.squareup.com";
const squareApiVersion = process.env.SQUARE_API_VERSION;
const maxRawEventChars = toNumber(process.env.MAX_RAW_EVENT_CHARS, 8000);

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  let eventId: string | null = null;
  try {
    const rawBody = getRawBody(event);
    if (!rawBody) {
      return jsonResponse(400, { error: "Missing request body" });
    }

    const signatureHeader = getHeader(event.headers, "x-square-hmacsha256");
    if (!signatureHeader) {
      return jsonResponse(401, { error: "Missing Square signature header" });
    }

    const signatureKey = await getSecretString(squareSignatureSecretArn);
    const notificationUrl = getNotificationUrl(event);
    const isValidSignature = validateSquareSignature({
      signatureHeader,
      signatureKey,
      notificationUrl,
      rawBody,
    });

    if (!isValidSignature) {
      return jsonResponse(401, { error: "Invalid signature" });
    }

    const payload = parseSquarePayload(rawBody);
    eventId = getEventId(payload);
    if (!eventId) {
      return jsonResponse(400, { error: "Missing Square event ID" });
    }

    const lockResult = await acquireEventLock(eventId);
    if (lockResult === "ALREADY_PROCESSED" || lockResult === "IN_PROGRESS") {
      return jsonResponse(200, { ok: true, status: lockResult });
    }

    const processed = await normalizeEvent(payload, rawBody);
    if (!processed.shouldProcess) {
      await markEventStatus(eventId, "IGNORED", processed.reason ?? "Ignored event type");
      return jsonResponse(200, { ok: true, status: "IGNORED" });
    }

    await appendRowToSheet(processed.rowValues);
    try {
      await markEventStatus(eventId, "PROCESSED");
    } catch (finalizeError) {
      console.error("Processed event but failed to finalize status", finalizeError);
    }

    return jsonResponse(200, { ok: true, status: "PROCESSED", event_id: eventId });
  } catch (error) {
    console.error("Webhook handler failed", error);
    if (eventId) {
      await releaseEventLock(eventId);
    }
    return jsonResponse(500, { error: "Internal error" });
  }
};

function parseSquarePayload(rawBody: string): SquareWebhookEnvelope {
  const parsed = JSON.parse(rawBody);
  if (!isRecord(parsed)) {
    throw new Error("Square payload is not an object");
  }
  return parsed as SquareWebhookEnvelope;
}

function getEventId(payload: SquareWebhookEnvelope): string | null {
  const id = asString(payload.event_id) ?? asString(payload.id);
  return id ?? null;
}

async function normalizeEvent(
  payload: SquareWebhookEnvelope,
  rawBody: string
): Promise<
  | { shouldProcess: false; reason: string }
  | {
      shouldProcess: true;
      rowValues: string[];
    }
> {
  const eventType = asString(payload.type) ?? asString(payload.event_type) ?? "UNKNOWN_EVENT";
  const payment = payload.data?.object?.payment;

  if (!payment) {
    return { shouldProcess: false, reason: `No payment object for event type ${eventType}` };
  }

  const paymentStatus = asString(payment.status) ?? "UNKNOWN";
  if (!eventType.startsWith("payment.") || paymentStatus !== "COMPLETED") {
    return {
      shouldProcess: false,
      reason: `Ignored event ${eventType} with status ${paymentStatus}`,
    };
  }

  const orderId = asString(payment.order_id);
  let order: SquareOrder | null = null;
  let notes = "";

  if (orderId) {
    const squareAccessToken = await getSecretString(squareAccessTokenSecretArn);
    order = await fetchOrderById(orderId, squareAccessToken);
  } else {
    notes = "NO_ORDER_ID";
  }

  const packageContext = derivePackageContext(order, payment);
  if (packageContext.note) {
    notes = notes ? `${notes};${packageContext.note}` : packageContext.note;
  }

  const buyerName = getBuyerName(order, payment);
  const buyerEmail = getBuyerEmail(order, payment);
  const buyerPhone = getBuyerPhone(order);
  const amount = payment.amount_money?.amount;
  const currency = payment.amount_money?.currency;
  const payloadEventId = getEventId(payload);
  const paymentId = asString(payment.id);
  const safeRawEvent = rawBody.length > maxRawEventChars ? rawBody.slice(0, maxRawEventChars) : rawBody;

  return {
    shouldProcess: true,
    rowValues: [
      new Date().toISOString(),
      payloadEventId ?? "",
      paymentId ?? "",
      orderId ?? "",
      packageContext.packageCode,
      packageContext.partySize ? String(packageContext.partySize) : "",
      typeof amount === "number" ? String(amount) : "",
      currency ?? "USD",
      buyerName ?? "",
      buyerEmail ?? "",
      buyerPhone ?? "",
      paymentStatus,
      notes,
      safeRawEvent,
    ],
  };
}

function derivePackageContext(order: SquareOrder | null, payment: SquarePayment): {
  packageCode: string;
  partySize: number | null;
  note: string | null;
} {
  const pkgMap = getPackageMap();
  const candidates: string[] = [];

  if (order?.reference_id) {
    candidates.push(order.reference_id);
  }

  for (const item of order?.line_items ?? []) {
    for (const token of [item.name, item.variation_name, item.note]) {
      if (token) candidates.push(token);
    }
  }

  if (payment.note) {
    candidates.push(payment.note);
  }

  for (const candidate of candidates) {
    const foundCode = extractPackageCode(candidate);
    if (foundCode) {
      return {
        packageCode: foundCode,
        partySize: pkgMap.get(foundCode) ?? extractPartySize(candidate) ?? null,
        note: pkgMap.has(foundCode) ? null : "PACKAGE_CODE_NOT_IN_MAP",
      };
    }
  }

  for (const candidate of candidates) {
    const fromText = extractPartySize(candidate);
    if (fromText) {
      return {
        packageCode: `GROUP_${fromText}`,
        partySize: fromText,
        note: "PACKAGE_INFERRED_FROM_TEXT",
      };
    }
  }

  const quantityValue = order?.line_items?.[0]?.quantity;
  const quantityAsNumber = quantityValue ? Number(quantityValue) : NaN;
  if (Number.isFinite(quantityAsNumber) && quantityAsNumber > 0) {
    return {
      packageCode: `GROUP_${Math.trunc(quantityAsNumber)}`,
      partySize: Math.trunc(quantityAsNumber),
      note: "PACKAGE_INFERRED_FROM_QUANTITY",
    };
  }

  return {
    packageCode: "UNMAPPED_PACKAGE",
    partySize: null,
    note: "UNMAPPED_PACKAGE",
  };
}

function getBuyerName(order: SquareOrder | null, payment: SquarePayment): string | null {
  const recipient = getOrderRecipient(order);
  if (recipient?.display_name) return recipient.display_name;

  const firstName = payment.billing_address?.first_name;
  const lastName = payment.billing_address?.last_name;
  if (firstName || lastName) return `${firstName ?? ""} ${lastName ?? ""}`.trim();

  return null;
}

function getBuyerEmail(order: SquareOrder | null, payment: SquarePayment): string | null {
  const recipient = getOrderRecipient(order);
  return recipient?.email_address ?? payment.buyer_email_address ?? null;
}

function getBuyerPhone(order: SquareOrder | null): string | null {
  const recipient = getOrderRecipient(order);
  return recipient?.phone_number ?? null;
}

function getOrderRecipient(order: SquareOrder | null): SquareFulfillmentRecipient | null {
  const fulfillment = order?.fulfillments?.[0];
  return fulfillment?.pickup_details?.recipient ?? fulfillment?.shipment_details?.recipient ?? null;
}

function extractPackageCode(value: string): string | null {
  const normalized = value.toUpperCase();
  const match = normalized.match(/\bGROUP[_-]?(\d+)\b/);
  if (!match?.[1]) return null;
  return `GROUP_${match[1]}`;
}

function extractPartySize(value: string): number | null {
  const peopleMatch = value.match(/\b(\d{1,2})\s*(PEOPLE|PERSON|PPL)\b/i);
  if (peopleMatch?.[1]) return Number(peopleMatch[1]);

  const groupMatch = value.match(/\bGROUP[_-]?(\d{1,2})\b/i);
  if (groupMatch?.[1]) return Number(groupMatch[1]);

  return null;
}

function getPackageMap(): Map<string, number> {
  if (packageMapCache.size > 0) {
    return packageMapCache;
  }

  const raw = process.env.PACKAGE_MAPPING_JSON;
  if (!raw) {
    packageMapCache.set("GROUP_1", 1);
    packageMapCache.set("GROUP_2", 2);
    packageMapCache.set("GROUP_4", 4);
    packageMapCache.set("GROUP_6", 6);
    packageMapCache.set("GROUP_8", 8);
    return packageMapCache;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error("PACKAGE_MAPPING_JSON must be an object");
    }
    for (const [key, value] of Object.entries(parsed)) {
      const normalized = key.toUpperCase();
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        packageMapCache.set(normalized, Math.trunc(numeric));
      }
    }
  } catch (error) {
    console.error("Failed parsing PACKAGE_MAPPING_JSON, using defaults", error);
    if (packageMapCache.size === 0) {
      packageMapCache.set("GROUP_1", 1);
      packageMapCache.set("GROUP_2", 2);
      packageMapCache.set("GROUP_4", 4);
      packageMapCache.set("GROUP_6", 6);
      packageMapCache.set("GROUP_8", 8);
    }
  }

  return packageMapCache;
}

async function fetchOrderById(orderId: string, accessToken: string): Promise<SquareOrder | null> {
  const url = `${squareApiBaseUrl.replace(/\/+$/, "")}/v2/orders/${encodeURIComponent(orderId)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (squareApiVersion) {
    headers["Square-Version"] = squareApiVersion;
  }

  const response = await fetch(url, { method: "GET", headers });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Square order fetch failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  if (!isRecord(payload)) {
    return null;
  }

  const order = payload.order;
  if (!isRecord(order)) {
    return null;
  }

  return order as SquareOrder;
}

async function appendRowToSheet(rowValues: string[]): Promise<void> {
  const credentials = await getGoogleServiceCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: googleSheetId,
    range: `${googleSheetTab}!A:N`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [rowValues],
    },
  });
}

async function getGoogleServiceCredentials(): Promise<Record<string, unknown>> {
  const secret = await getSecretString(googleServiceAccountSecretArn);
  const parsed = JSON.parse(secret);
  if (!isRecord(parsed)) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT secret must be a JSON object");
  }

  const normalized = { ...parsed };
  const privateKey = normalized.private_key;
  if (typeof privateKey === "string") {
    normalized.private_key = privateKey.replace(/\\n/g, "\n");
  }

  return normalized;
}

async function getSecretString(secretArn: string): Promise<string> {
  const cached = secretCache.get(secretArn);
  if (cached) return cached;

  const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!response.SecretString) {
    throw new Error(`Secret ${secretArn} has no SecretString`);
  }

  secretCache.set(secretArn, response.SecretString);
  return response.SecretString;
}

async function acquireEventLock(eventId: string): Promise<LockResult> {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const ttlEpoch = nowEpoch + ttlDays * 86400;
  const lockExpiresEpoch = nowEpoch + processingLockSeconds;

  try {
    await ddb.send(
      new PutCommand({
        TableName: eventTableName,
        Item: {
          event_id: eventId,
          status: "PROCESSING",
          received_at: new Date().toISOString(),
          lock_expires_epoch: lockExpiresEpoch,
          ttl_epoch: ttlEpoch,
        },
        ConditionExpression: "attribute_not_exists(event_id)",
      })
    );
    return "LOCK_ACQUIRED";
  } catch (error) {
    if (!isConditionalCheckError(error)) {
      throw error;
    }
  }

  const existing = await ddb.send(
    new GetCommand({
      TableName: eventTableName,
      Key: { event_id: eventId },
      ConsistentRead: true,
    })
  );

  const existingItem = existing.Item;
  const existingStatus = asString(existingItem?.status);
  const existingLock = Number(existingItem?.lock_expires_epoch ?? 0);

  if (existingStatus === "PROCESSED" || existingStatus === "IGNORED") {
    return "ALREADY_PROCESSED";
  }

  if (existingLock < nowEpoch) {
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: eventTableName,
          Key: { event_id: eventId },
          UpdateExpression:
            "SET #status = :processing, lock_expires_epoch = :lock, updated_at = :updated, ttl_epoch = :ttl",
          ConditionExpression:
            "(attribute_not_exists(lock_expires_epoch) OR lock_expires_epoch < :now) AND (#status <> :processed OR attribute_not_exists(#status))",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":processing": "PROCESSING",
            ":processed": "PROCESSED",
            ":lock": lockExpiresEpoch,
            ":updated": new Date().toISOString(),
            ":now": nowEpoch,
            ":ttl": ttlEpoch,
          },
        })
      );
      return "LOCK_ACQUIRED";
    } catch (error) {
      if (!isConditionalCheckError(error)) {
        throw error;
      }
    }
  }

  return "IN_PROGRESS";
}

async function markEventStatus(eventId: string, status: "PROCESSED" | "IGNORED", note?: string): Promise<void> {
  const values: Record<string, unknown> = {
    ":status": status,
    ":processed_at": new Date().toISOString(),
    ":lock_expired": Math.floor(Date.now() / 1000) - 1,
  };

  let updateExpression =
    "SET #status = :status, processed_at = :processed_at, lock_expires_epoch = :lock_expired";

  if (note) {
    updateExpression += ", note = :note";
    values[":note"] = note;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: eventTableName,
      Key: { event_id: eventId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: values,
    })
  );
}

async function releaseEventLock(eventId: string): Promise<void> {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: eventTableName,
        Key: { event_id: eventId },
      })
    );
  } catch (error) {
    console.error("Failed to release lock for event", eventId, error);
  }
}

function validateSquareSignature(params: {
  signatureHeader: string;
  signatureKey: string;
  notificationUrl: string;
  rawBody: string;
}): boolean {
  const digest = crypto
    .createHmac("sha256", params.signatureKey)
    .update(params.notificationUrl + params.rawBody, "utf8")
    .digest("base64");

  const digestBuffer = Buffer.from(digest);
  const signatureBuffer = Buffer.from(params.signatureHeader);
  if (digestBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
}

function getNotificationUrl(event: APIGatewayProxyEventV2): string {
  const host = getHeader(event.headers, "x-forwarded-host") ?? getHeader(event.headers, "host");
  if (!host) {
    throw new Error("Missing host header");
  }

  const protocol = getHeader(event.headers, "x-forwarded-proto") ?? "https";
  const rawPath = event.rawPath || "/";
  const rawQuery = event.rawQueryString ? `?${event.rawQueryString}` : "";
  return `${protocol}://${host}${rawPath}${rawQuery}`;
}

function getRawBody(event: APIGatewayProxyEventV2): string {
  if (!event.body) return "";
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64").toString("utf8");
  }
  return event.body;
}

function getHeader(headers: APIGatewayProxyEventV2["headers"], key: string): string | null {
  if (!headers) return null;
  const wanted = key.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === wanted && value) return value;
  }
  return null;
}

function jsonResponse(
  statusCode: number,
  payload: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

function isConditionalCheckError(error: unknown): boolean {
  return isRecord(error) && asString(error.name) === "ConditionalCheckFailedException";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function toNumber(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
