output "webhook_function_name" {
  description = "Lambda function name for Square webhook processing"
  value       = aws_lambda_function.webhook.function_name
}

output "webhook_function_url" {
  description = "Public URL to configure in Square webhook settings"
  value       = aws_lambda_function_url.webhook.function_url
}

output "dynamodb_table_name" {
  description = "DynamoDB table used for webhook idempotency"
  value       = aws_dynamodb_table.webhook_events.name
}

output "square_signature_secret_arn" {
  description = "Secrets Manager ARN for Square webhook signature key"
  value       = aws_secretsmanager_secret.square_signature.arn
}

output "square_access_token_secret_arn" {
  description = "Secrets Manager ARN for Square access token"
  value       = aws_secretsmanager_secret.square_access_token.arn
}

output "google_service_account_secret_arn" {
  description = "Secrets Manager ARN for Google service account JSON"
  value       = aws_secretsmanager_secret.google_service_account.arn
}
