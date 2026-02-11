# Backend Webhook Service

Lambda handler for Square payment webhooks.

## Responsibilities

1. Validate Square webhook signature (`x-square-hmacsha256`).
2. Enforce idempotency in DynamoDB table `square_webhook_events`.
3. Process only completed payment events.
4. Fetch related Square order details for package metadata.
5. Append normalized purchase rows to Google Sheets.

## Required Environment Variables

- `EVENT_TABLE_NAME`
- `SQUARE_SIGNATURE_SECRET_ARN`
- `SQUARE_ACCESS_TOKEN_SECRET_ARN`
- `GOOGLE_SERVICE_ACCOUNT_SECRET_ARN`
- `GOOGLE_SHEET_ID`

Optional:

- `GOOGLE_SHEET_TAB` (default: `Bookings`)
- `PACKAGE_MAPPING_JSON`
- `EVENT_TTL_DAYS` (default: `90`)
- `PROCESSING_LOCK_SECONDS` (default: `120`)
- `MAX_RAW_EVENT_CHARS` (default: `8000`)
- `SQUARE_API_BASE_URL` (default: `https://connect.squareup.com`)
- `SQUARE_API_VERSION`

## Build

```bash
npm install
npm run typecheck
npm run build
```
