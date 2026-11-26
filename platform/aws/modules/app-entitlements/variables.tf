variable "name" {
  type = string
}

variable "payments_account_id" {
  description = "The payments account (from the organization stack's outputs). Only its sender role may write."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.payments_account_id))
    error_message = "payments_account_id must be a 12-digit account id."
  }
}

variable "sender_role_name" {
  description = "Role name of the Paddle webhook Lambda in the payments account (app-paddle-webhook's role_name)."
  type        = string
  default     = "payments-paddle-webhook"
}

variable "source_dir" {
  description = "Built consumer bundle (runtime/dist/entitlement-consumer)."
  type        = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "app_security_group_id" {
  type = string
}

variable "db_host" {
  type = string
}

variable "db_port" {
  type = number
}

variable "db_connect_arn_prefix" {
  type = string
}

variable "kms_key_arn" {
  description = "Platform key (logs, Lambda environment)."
  type        = string
}

variable "alarm_topic_arn" {
  description = "SNS topic for the DLQ alarm (e.g. from the spend-guards/security stack). null = alarm without action."
  type        = string
  default     = null
}

variable "log_retention_days" {
  type    = number
  default = 365
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary attached to every IAM role this module creates (the account's workload-boundary from stacks/github-oidc). null = none."
  type        = string
  default     = null
}
