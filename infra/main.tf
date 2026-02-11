provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

data "archive_file" "lambda_bundle" {
  type        = "zip"
  source_file = var.lambda_source_file
  output_path = "${path.module}/lambda-bundle.zip"
}

resource "aws_dynamodb_table" "webhook_events" {
  name         = "${local.name_prefix}-square-webhook-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "event_id"

  attribute {
    name = "event_id"
    type = "S"
  }

  ttl {
    enabled        = true
    attribute_name = "ttl_epoch"
  }
}

resource "aws_secretsmanager_secret" "square_signature" {
  name                    = "${local.name_prefix}/square/webhook-signature-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret" "square_access_token" {
  name                    = "${local.name_prefix}/square/access-token"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret" "google_service_account" {
  name                    = "${local.name_prefix}/google/service-account-json"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "square_signature" {
  count         = var.create_secret_versions ? 1 : 0
  secret_id     = aws_secretsmanager_secret.square_signature.id
  secret_string = var.square_webhook_signature_key
}

resource "aws_secretsmanager_secret_version" "square_access_token" {
  count         = var.create_secret_versions ? 1 : 0
  secret_id     = aws_secretsmanager_secret.square_access_token.id
  secret_string = var.square_access_token
}

resource "aws_secretsmanager_secret_version" "google_service_account" {
  count         = var.create_secret_versions ? 1 : 0
  secret_id     = aws_secretsmanager_secret.google_service_account.id
  secret_string = var.google_service_account_json
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

data "aws_iam_policy_document" "lambda_permissions" {
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["${aws_cloudwatch_log_group.webhook.arn}:*"]
  }

  statement {
    sid    = "DynamoWebhookEvents"
    effect = "Allow"
    actions = [
      "dynamodb:DeleteItem",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem"
    ]
    resources = [aws_dynamodb_table.webhook_events.arn]
  }

  statement {
    sid    = "ReadSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [
      aws_secretsmanager_secret.square_signature.arn,
      aws_secretsmanager_secret.square_access_token.arn,
      aws_secretsmanager_secret.google_service_account.arn
    ]
  }
}

resource "aws_iam_role" "lambda_webhook" {
  name               = "${local.name_prefix}-square-webhook-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "lambda_webhook" {
  name   = "${local.name_prefix}-square-webhook-policy"
  role   = aws_iam_role.lambda_webhook.id
  policy = data.aws_iam_policy_document.lambda_permissions.json
}

resource "aws_cloudwatch_log_group" "webhook" {
  name              = "/aws/lambda/${local.name_prefix}-square-webhook"
  retention_in_days = 14
}

resource "aws_lambda_function" "webhook" {
  function_name    = "${local.name_prefix}-square-webhook"
  role             = aws_iam_role.lambda_webhook.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 20
  memory_size      = 256

  environment {
    variables = {
      EVENT_TABLE_NAME                  = aws_dynamodb_table.webhook_events.name
      SQUARE_SIGNATURE_SECRET_ARN       = aws_secretsmanager_secret.square_signature.arn
      SQUARE_ACCESS_TOKEN_SECRET_ARN    = aws_secretsmanager_secret.square_access_token.arn
      GOOGLE_SERVICE_ACCOUNT_SECRET_ARN = aws_secretsmanager_secret.google_service_account.arn
      GOOGLE_SHEET_ID                   = var.google_sheet_id
      GOOGLE_SHEET_TAB                  = var.google_sheet_tab
      PACKAGE_MAPPING_JSON              = var.package_mapping_json
      EVENT_TTL_DAYS                    = tostring(var.event_ttl_days)
      PROCESSING_LOCK_SECONDS           = tostring(var.processing_lock_seconds)
      MAX_RAW_EVENT_CHARS               = tostring(var.max_raw_event_chars)
      SQUARE_API_BASE_URL               = var.square_api_base_url
      SQUARE_API_VERSION                = var.square_api_version
    }
  }

  depends_on = [
    aws_iam_role_policy.lambda_webhook,
    aws_cloudwatch_log_group.webhook
  ]
}

resource "aws_lambda_function_url" "webhook" {
  function_name      = aws_lambda_function.webhook.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "webhook_public" {
  statement_id           = "AllowPublicFunctionUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.webhook.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}
