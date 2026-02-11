# Infrastructure (Terraform)

Creates:

1. Lambda function + Function URL webhook endpoint.
2. DynamoDB idempotency table.
3. IAM role/policy for Lambda.
4. CloudWatch log group.
5. Secrets Manager secrets for Square and Google credentials.

## Prerequisites

1. Built Lambda bundle at `../backend/dist/index.js`.
2. AWS credentials configured locally.

## Deploy

```bash
terraform init
terraform apply -var-file=env/prod.tfvars
```

## Important Notes

1. `create_secret_versions = false` by default to avoid storing secrets in state.
2. Add secret values manually in Secrets Manager after first apply.
3. Re-run `terraform apply` after backend rebuilds to update Lambda code.
