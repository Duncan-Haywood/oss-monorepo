variable "role_name" {
  description = "Lambda and IAM role name. Must equal the apps stack's sender_role_name."
  type        = string
  default     = "payments-paddle-webhook"
}

variable "secret_name" {
  description = "Secrets Manager name for the Paddle destination secret key (value put by the owner)."
  type        = string
  default     = "paddle/notification-secret"
}

variable "source_dir" {
  description = "Built receiver bundle (runtime/dist/paddle-webhook)."
  type        = string
}

variable "queue_url" {
  description = "apps stack output entitlement_queue_url."
  type        = string
}

variable "queue_arn" {
  description = "apps stack output entitlement_queue_arn."
  type        = string
}

variable "queue_kms_key_arn" {
  description = "apps stack output entitlement_queue_kms_key_arn."
  type        = string
}

variable "reserved_concurrency" {
  description = "Ceiling on parallel executions (also limits what a flood of forged requests can cost)."
  type        = number
  default     = 10
}

variable "alarm_topic_arn" {
  type    = string
  default = null
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
