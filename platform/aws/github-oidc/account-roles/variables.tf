variable "github_owner" {
  description = "GitHub owner of the repositories."
  type        = string
}

variable "apply_environment" {
  description = "GitHub environment apply jobs run in."
  type        = string
  default     = "aws-prod"
}

variable "create_oidc_provider" {
  description = "False in the management account, where the CloudFormation seed created it."
  type        = bool
  default     = true
}

variable "state_bucket_arn" {
  description = "bootstrap output state_bucket_arn."
  type        = string
}

variable "state_kms_key_arn" {
  description = "bootstrap output state_kms_key_arn."
  type        = string
}

variable "shared_state_stacks" {
  description = "Stacks whose state every role may read (matches bootstrap)."
  type        = list(string)
  default     = ["bootstrap", "org", "baseline", "github-oidc", "dns"]
}

variable "stacks" {
  description = "Stacks applied in this account."
  type = map(object({
    repo             = string
    managed_policies = list(string)
    extra_statements = optional(list(any), [])
  }))
  default = {}
}

variable "extra_roles" {
  description = "Other OIDC roles, keyed by role name."
  type = map(object({
    description = string
    subject     = string
    statements  = list(any)
  }))
  default = {}
}
