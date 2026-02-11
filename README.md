# Wool & Wonder Studio Website

Static marketing site plus a lean payments backend:

1. Customers purchase fixed package sizes through Square hosted checkout.
2. Square webhooks hit an AWS Lambda.
3. Lambda appends normalized paid purchase records to Google Sheets.
4. You manually schedule class times after purchase.

## Repo Layout

- `index.html`, `styles.css`, `app.js`: public website (GitHub Pages).
- `thanks.html`: optional post-purchase thank-you page.
- `backend/`: TypeScript Lambda webhook service.
- `infra/`: Terraform for AWS resources.

## Frontend Setup (Square Selector: 3-8 People)

The package section now uses:

- One per-person Square product/price
- A 3-8 people selector in `index.html`
- Live total estimate in `app.js`

Update `index.html` package config:

- `data-price-per-person="95"` -> set your real per-person price
- `data-square-link="https://square.link/u/REPLACE_WITH_YOUR_LINK"` -> set your real Square Payment Link

Detailed setup steps are in:

- `SQUARE_PRODUCT_SETUP.md`

## Backend Lambda Setup

From repo root:

```bash
cd backend
npm install
npm run build
```

This generates `backend/dist/index.js`, which Terraform packages and deploys.

## AWS Terraform Setup

1. Copy `infra/env/prod.tfvars.example` to `infra/env/prod.tfvars`.
2. Set at minimum:
   - `google_sheet_id`
3. Deploy:

```bash
cd infra
terraform init
terraform apply -var-file=env/prod.tfvars
```

Outputs include:

- `webhook_function_url`
- `webhook_function_name`
- `dynamodb_table_name`
- secret ARNs for Square/Google credentials

## Secret Population

By default, Terraform creates the secrets but does not write values (to avoid storing secrets in state).

Set secret values manually in AWS Secrets Manager:

1. `square/webhook-signature-key`
2. `square/access-token`
3. `google/service-account-json`

You can also set `create_secret_versions = true` in tfvars and pass values, but that stores secrets in Terraform state.

## Square Configuration

1. Create one per-person product/item in Square.
2. Create one Payment Link for that product/item.
3. Update `index.html` package section:
   - `data-price-per-person`
   - `data-square-link`
4. Configure webhook endpoint to Terraform output `webhook_function_url`.
5. Subscribe to payment events (recommend `payment.updated`).
6. If webhook rows show `UNMAPPED_PACKAGE`, confirm quantity/details are present in Square order payload.

## Google Sheets Configuration

1. Create sheet tab `Bookings` (or set `google_sheet_tab`).
2. Share sheet with the Google service account email as Editor.
3. Put the full service account JSON in Secrets Manager.

Expected columns (A:N):

1. `received_at_utc`
2. `square_event_id`
3. `square_payment_id`
4. `square_order_id`
5. `package_code`
6. `party_size`
7. `amount_money`
8. `currency`
9. `buyer_name`
10. `buyer_email`
11. `buyer_phone`
12. `payment_status`
13. `notes`
14. `raw_event_json`

## Local Validation

```bash
cd backend
npm run typecheck
npm run build

cd ../infra
terraform fmt -recursive
terraform validate
```
