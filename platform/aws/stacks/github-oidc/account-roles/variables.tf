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
  default     = "us-east-2"
}

variable "shared_state_stacks" {
  description = "Stacks in this account whose state every role here may read (for example dns, read by site)."
  type        = list(string)
  default     = []
}

variable "stacks" {
  description = "Stacks applied in this account."
  type = map(object({
    repo             = string
    managed_policies = list(string)
    extra_statements = optional(any, [])
    iam_prefixes     = optional(list(string))
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

variable "create_boundary" {
  description = "False in single-account mode, where stacks/org makes the account's workload-boundary."
  type        = bool
  default     = true
}

variable "boundary_on_ci_roles" {
  description = "Attach the workload-boundary to the gha-* roles themselves (single-account mode)."
  type        = bool
  default     = false
}

variable "state_bucket_name" {
  description = "State bucket name; null means <account>-tofu-state-<region>. Single-account mode names it apart from the bootstrap's bucket of that name."
  type        = string
  default     = null
}

variable "state_kms_alias" {
  description = "Alias of the state key (single-account mode keeps it apart from the bootstrap's alias/tofu-state)."
  type        = string
  default     = "alias/tofu-state"
}
