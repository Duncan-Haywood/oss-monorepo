variable "account_key" {
  description = "Short account name (management, log-archive, apps, ...)."
  type        = string
}

variable "is_management" {
  description = "True for the management account: it already has the bootstrap's github-plan role, so no member plan role is made."
  type        = bool
  default     = false
}

variable "log_bucket_name" {
  description = "Log-archive bucket that receives AWS Config snapshots and history."
  type        = string
}

variable "log_kms_key_arn" {
  description = "KMS key in the log-archive account that encrypts the log bucket."
  type        = string
}

variable "management_account_id" {
  description = "Account ID of the management account (trusted by the member plan and kill-switch roles)."
  type        = string
}

variable "record_global_resources" {
  description = "Record IAM and other global resources in this region (true in the home region only)."
  type        = bool
  default     = true
}

variable "permissions_boundary_arn" {
  description = "Boundary for the roles made here (single-account mode: stacks/org's workload-boundary). Null for none."
  type        = string
  default     = null
}
