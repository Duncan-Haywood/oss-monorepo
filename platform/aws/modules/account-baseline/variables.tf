variable "account_name" {
  description = "Account name (management, apps, ...), used in descriptions."
  type        = string
}

variable "manage_global_resources" {
  description = "True for exactly one region per account (us-east-1): account-wide S3 Block Public Access, the Config service-linked role, and recording of global resource types."
  type        = bool
}

variable "create_config_service_linked_role" {
  description = "False when AWSServiceRoleForConfig already exists in the account (for example created by an earlier tool)."
  type        = bool
  default     = true
}

variable "config_bucket_name" {
  description = "The log-archive bucket (baseline output log_archive_bucket_name)."
  type        = string
}

variable "config_kms_key_arn" {
  description = "The log-archive key (baseline output log_archive_kms_key_arn)."
  type        = string
}
