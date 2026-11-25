variable "deploy_role_arn" {
  description = "Role the provider assumes. Null in CI (the job already holds gha-oss-monorepo-foundation-apply)."
  type        = string
  default     = null
}

variable "management_account_id" {
  description = "When set, the provider refuses any other account."
  type        = string
  default     = null
}

variable "name_prefix" {
  description = "Prefix for account names."
  type        = string
  default     = "oss-monorepo"
}

variable "account_email_template" {
  description = <<-EOT
    printf-style template for each member account's root email, with %s
    replaced by the account name, for example "aws+%s@example.org". Every
    account needs a distinct address that the owner receives. Personal data:
    pass it from the AWS_ACCOUNT_EMAIL_TEMPLATE Actions variable, never a
    committed file.
  EOT
  type        = string

  validation {
    condition     = length(regexall("%s", var.account_email_template)) == 1 && can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.account_email_template))
    error_message = "account_email_template must be an email address containing exactly one %s."
  }
}

variable "allowed_regions" {
  description = "Regions any principal in a member account may use. The SCP denies every other region for regional services."
  type        = list(string)
  default     = ["us-east-1", "us-west-2"]

  validation {
    condition     = length(var.allowed_regions) > 0 && alltrue([for r in var.allowed_regions : contains(["us-east-1", "us-west-2"], r)])
    error_message = "Only us-east-1 and us-west-2 are approved (docs/reports/2026-11-24-cloud-provider-comparison.md, section 7)."
  }
}

variable "identity_center_enabled" {
  description = "Set true (Actions variable AWS_IDENTITY_CENTER_ENABLED) once the owner has enabled the IAM Identity Center organization instance; AWS offers no API to enable it."
  type        = bool
  default     = false
}

variable "public_repository" {
  description = "owner/name of the public repository whose Actions must never reach the payments account."
  type        = string
  default     = "Duncan-Haywood/oss-monorepo"
}

variable "enable_data_perimeter_rcp" {
  description = "Attach the resource control policy that denies S3, KMS, Secrets Manager and SQS access to principals outside the organization (AWS services excepted)."
  type        = bool
  default     = true
}
