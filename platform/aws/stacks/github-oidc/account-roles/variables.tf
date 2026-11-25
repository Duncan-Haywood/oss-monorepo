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
  description = "False where another stack already created the account's GitHub OIDC provider (apps: stacks/llm)."
  type        = bool
  default     = true
}

variable "region" {
  description = "Region of the state bucket."
  type        = string
  default     = "us-east-1"
}

variable "shared_state_stacks" {
  description = "Stacks in this account whose state every role here may read (for example dns, read by site)."
  type        = list(string)
  default     = ["dns"]
}

variable "stacks" {
  description = "Stacks applied in this account."
  type = map(object({
    repo             = string
    managed_policies = list(string)
    extra_statements = optional(any, [])
  }))
  default = {}
}

variable "extra_roles" {
  description = "Other OIDC roles, keyed by role name."
  type = map(object({
    description = string
    subject     = string
    statements  = any
  }))
  default = {}
}
