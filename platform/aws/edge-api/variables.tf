variable "region" {
  description = "Home region. CloudFront, ACM and WAF need us-east-1."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "Only the allowed regions: us-east-1, us-west-2."
  }
}

variable "deploy_role_arn" {
  description = "Role in the shared-infra account that OpenTofu assumes (gha-oss-monorepo-edge-api-apply in CI, the -plan role for PRs)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:role/", var.deploy_role_arn))
    error_message = "deploy_role_arn must be an IAM role ARN."
  }
}

variable "name" {
  description = "Name of the function, table and log group."
  type        = string
  default     = "edge-api"
}

variable "allowed_origins" {
  description = "Origins whose pages may post feedback (scheme + host). Same list as wrangler.toml's ALLOWED_ORIGIN."
  type        = list(string)
  default     = ["https://marisstella.app", "https://monorepo-projects-site.duncan-andrew-haywood.workers.dev", "https://duncan-haywood.github.io"]
}

variable "path_prefix" {
  description = "Path the site's CloudFront distribution routes to this origin; stripped before routing. Empty when the origin has its own hostname."
  type        = string
  default     = "/_edge"

  validation {
    condition     = var.path_prefix == "" || can(regex("^/[a-z0-9_-]+$", var.path_prefix))
    error_message = "path_prefix is empty or one path segment such as /_edge."
  }
}

variable "feedback_daily_cap" {
  description = "Feedback messages accepted per UTC day, site-wide (FEEDBACK_DAILY_CAP)."
  type        = number
  default     = 50
}

variable "max_per_slug_per_day" {
  description = "Cap per count key per UTC day (MAX_PER_SLUG_PER_DAY)."
  type        = number
  default     = 20000
}

variable "inbox_daily_cap" {
  description = "Inbound support messages stored per UTC day (INBOX_DAILY_CAP)."
  type        = number
  default     = 200
}

variable "inbox_retention_days" {
  description = "Days an inbound message is kept (GDPR storage limitation; the privacy copy says 90)."
  type        = number
  default     = 90
}

variable "reserved_concurrency" {
  description = "Hard ceiling on concurrent executions: the spend cap for a flood that gets past the WAF rate rule."
  type        = number
  default     = 10

  validation {
    condition     = var.reserved_concurrency >= 1 && var.reserved_concurrency <= 50
    error_message = "Keep reserved_concurrency between 1 and 50."
  }
}

variable "log_retention_days" {
  description = "Retention of the function's logs."
  type        = number
  default     = 365
}

variable "alarm_topic_arn" {
  description = "SNS topic for error and throttle alarms (the spend-guards stack's alert topic). Null = alarms with no action."
  type        = string
  default     = null
}
