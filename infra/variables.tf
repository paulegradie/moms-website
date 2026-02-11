variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
  default     = "us-east-1"
}

variable "project_name" {
  type        = string
  description = "Project slug used in resource names"
  default     = "moms-felting"
}

variable "environment" {
  type        = string
  description = "Environment name (prod, sandbox, etc.)"
  default     = "prod"
}

variable "lambda_source_file" {
  type        = string
  description = "Path to the built Lambda bundle (run backend build first)"
  default     = "../backend/dist/index.js"
}

variable "google_sheet_id" {
  type        = string
  description = "Google Sheets spreadsheet ID used for purchase rows"
}

variable "google_sheet_tab" {
  type        = string
  description = "Sheet tab name inside the spreadsheet"
  default     = "Bookings"
}

variable "package_mapping_json" {
  type        = string
  description = "JSON map from package code to party size"
  default     = "{\"GROUP_1\":1,\"GROUP_2\":2,\"GROUP_4\":4,\"GROUP_6\":6,\"GROUP_8\":8}"
}

variable "event_ttl_days" {
  type        = number
  description = "TTL days for idempotency records"
  default     = 90
}

variable "processing_lock_seconds" {
  type        = number
  description = "Lock duration for in-flight webhook events"
  default     = 120
}

variable "max_raw_event_chars" {
  type        = number
  description = "Maximum webhook payload characters to keep in sheet row"
  default     = 8000
}

variable "square_api_base_url" {
  type        = string
  description = "Square API base URL"
  default     = "https://connect.squareup.com"
}

variable "square_api_version" {
  type        = string
  description = "Optional Square-Version header value"
  default     = ""
}

variable "create_secret_versions" {
  type        = bool
  description = "If true, Terraform writes initial secret values (stored in state)"
  default     = false
}

variable "square_webhook_signature_key" {
  type        = string
  description = "Square webhook signature key value"
  sensitive   = true
  default     = ""
}

variable "square_access_token" {
  type        = string
  description = "Square access token used to read order details"
  sensitive   = true
  default     = ""
}

variable "google_service_account_json" {
  type        = string
  description = "Google service account JSON for Sheets API"
  sensitive   = true
  default     = ""
}
