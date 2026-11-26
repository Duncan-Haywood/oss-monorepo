variable "account_mode" {
  description = "organization or single (stacks/org's variable of the same name; the workflows set it from the repository variable AWS_ACCOUNT_MODE). In single mode every provider uses the workflow's own credentials: there are no member accounts to assume a role in."
  type        = string
  default     = "organization"

  validation {
    condition     = contains(["organization", "single"], var.account_mode)
    error_message = "account_mode must be organization or single."
  }
}

variable "region" {
  type    = string
  default = "us-east-2"
}

variable "state_bucket" {
  type = string
}

variable "member_role_name" {
  type    = string
  default = "OrganizationAccountAccessRole"
}

variable "github_repository" {
  type    = string
  default = "Duncan-Haywood/oss-monorepo"
}

variable "sync_environment" {
  description = "GitHub environment whose jobs may read the key to push it into Worker secrets. `cloudflare` already holds the Workers deploy credential and is limited to main."
  type        = string
  default     = "cloudflare"
}

variable "rotation_days" {
  description = "Days between key rotations. The previous key stays valid until the next rotation, so the daily Worker sync has this long to pick up the new one."
  type        = number
  default     = 30
}
