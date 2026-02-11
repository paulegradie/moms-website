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

## Frontend Setup

Edit package purchase links in `index.html` section `#packages`:

- `https://square.link/u/REPLACE-GROUP-1`
- `https://square.link/u/REPLACE-GROUP-2`
- `https://square.link/u/REPLACE-GROUP-4`
- `https://square.link/u/REPLACE-GROUP-6`
- `https://square.link/u/REPLACE-GROUP-8`

Replace each with the real Square Payment Link URL for that package.

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

1. Create fixed products/packages in Square:
   - `GROUP_1`, `GROUP_2`, `GROUP_4`, `GROUP_6`, `GROUP_8`
2. Create one Payment Link for each package.
3. Configure webhook endpoint to Terraform output `webhook_function_url`.
4. Subscribe to payment events (recommend `payment.updated`).
5. Use product names or references containing `GROUP_X` so party size maps correctly.

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
