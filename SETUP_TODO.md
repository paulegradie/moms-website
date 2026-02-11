# Setup TODO

## 1) Square Product + Payment Link (3-8 People)

- [ ] Follow `SQUARE_PRODUCT_SETUP.md`.
- [ ] Create one Square per-person item with fixed per-person pricing.
- [ ] Create one Square Payment Link for that item.
- [ ] Update `index.html` package config:
  - [ ] `data-price-per-person`
  - [ ] `data-square-link`
- [ ] Confirm selector estimate matches checkout total.

## 2) Google Sheets

- [ ] Create a spreadsheet for paid bookings.
- [ ] Create a tab named `Bookings` (or update Terraform variable to match your tab).
- [ ] Add headers in row 1 (A:N):
  - [ ] `received_at_utc`
  - [ ] `square_event_id`
  - [ ] `square_payment_id`
  - [ ] `square_order_id`
  - [ ] `package_code`
  - [ ] `party_size`
  - [ ] `amount_money`
  - [ ] `currency`
  - [ ] `buyer_name`
  - [ ] `buyer_email`
  - [ ] `buyer_phone`
  - [ ] `payment_status`
  - [ ] `notes`
  - [ ] `raw_event_json`
- [ ] Create a Google service account and download JSON key.
- [ ] Share the sheet with the service account email as `Editor`.

## 3) Backend Build

- [ ] Run:
  - [ ] `cd backend`
  - [ ] `npm install`
  - [ ] `npm run typecheck`
  - [ ] `npm run build`

## 4) Terraform Deploy (AWS)

- [ ] Create `infra/env/prod.tfvars` from `infra/env/prod.tfvars.example`.
- [ ] Set `google_sheet_id` in `infra/env/prod.tfvars`.
- [ ] Run:
  - [ ] `cd infra`
  - [ ] `terraform init`
  - [ ] `terraform apply -var-file=env/prod.tfvars`
- [ ] Save output values:
  - [ ] `webhook_function_url`
  - [ ] `square_signature_secret_arn`
  - [ ] `square_access_token_secret_arn`
  - [ ] `google_service_account_secret_arn`

## 5) Secrets Manager Values

- [ ] Set value for Square webhook signature secret.
- [ ] Set value for Square access token secret.
- [ ] Set value for Google service account JSON secret.

## 6) Square Webhook

- [ ] In Square Developer Dashboard, configure webhook endpoint to:
  - [ ] `webhook_function_url` from Terraform output
- [ ] Subscribe to payment events (for example `payment.updated`).
- [ ] Send test event and confirm Lambda logs success.

## 7) End-to-End Verification

- [ ] Complete one real or sandbox purchase from website package section.
- [ ] Confirm webhook request appears in Lambda logs.
- [ ] Confirm one row appears in Google Sheet.
- [ ] Re-send same Square webhook event and verify no duplicate sheet row.

## 8) Website Content Finalization

- [ ] Update contact email in `index.html`.
- [ ] Update city/state in footer.
- [ ] Add real Instagram/website links in `index.html`.
- [ ] Review selector copy and per-person pricing language for clarity.
