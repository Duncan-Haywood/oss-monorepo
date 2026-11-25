variable "deploy_role_arn" {
  description = "Role for the management-account providers. Null in CI (the job holds gha-oss-monorepo-foundation-apply)."
  type        = string
  default     = null
}

variable "member_role_name" {
  description = "Role the management session chains into in log-archive and security (created with each account by the org stack, and the only principal the SCPs let change security services)."
  type        = string
  default     = "OrganizationAccountAccessRole"
}

variable "state_bucket" {
  description = "State bucket name (bootstrap output state_bucket_name); used to read the org stack's outputs. Ignored when account_ids and organization_id are given."
  type        = string
  default     = null
}

variable "account_ids" {
  description = "Override for the org stack's account_ids output (tests, or a run without remote state)."
  type        = map(string)
  default     = null
}

variable "organization_id" {
  description = "Override for the org stack's organization_id output."
  type        = string
  default     = null
}

variable "name_prefix" {
  description = "Prefix for globally unique names."
  type        = string
  default     = "oss-monorepo"
}

variable "log_object_lock_mode" {
  description = "GOVERNANCE (an SCP denies bypass to everyone but the baseline role) or COMPLIANCE (nobody, root included, can delete before expiry; choose only once the retention is settled)."
  type        = string
  default     = "GOVERNANCE"

  validation {
    condition     = contains(["GOVERNANCE", "COMPLIANCE"], var.log_object_lock_mode)
    error_message = "GOVERNANCE or COMPLIANCE."
  }
}

variable "log_object_lock_days" {
  description = "Days every log object is write-once. CIS asks for at least a year of trail history."
  type        = number
  default     = 365
}

variable "log_retention_days" {
  description = "Days before logs are deleted. Must exceed the lock."
  type        = number
  default     = 730
}

variable "findings_min_severity" {
  description = "Security Hub severity labels that are exported to the findings queue."
  type        = list(string)
  default     = ["CRITICAL", "HIGH"]
}

variable "trail_data_event_bucket_arns" {
  description = "Buckets whose object-level access the organization trail records (the state bucket by default, which covers its access logging). Null means read bootstrap's state_bucket_arn."
  type        = list(string)
  default     = null
}

variable "organization_root_id" {
  description = "Override for the org stack's organization_root_id output."
  type        = string
  default     = null
}
