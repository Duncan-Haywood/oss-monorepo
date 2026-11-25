variable "region" {
  description = "Home region. us-east-1 because CloudFront, ACM for CloudFront and WAF for CloudFront live there."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "Only the allowed regions us-east-1 and us-west-2 may be used."
  }
}

variable "deploy_role_arn" {
  description = "Role the provider assumes. Null for the first, human-run apply; then the gha-oss-monorepo-bootstrap-apply role ARN."
  type        = string
  default     = null
}

variable "expected_account_id" {
  description = "The management account ID. When set, the provider refuses to touch any other account (a guard against applying with the wrong credentials)."
  type        = string
  default     = null
}

variable "name_prefix" {
  description = "Prefix for globally unique names. The account ID and region are appended, so collisions are unlikely."
  type        = string
  default     = "oss-monorepo"

  validation {
    condition     = can(regex("^[a-z0-9-]{3,24}$", var.name_prefix))
    error_message = "name_prefix must be 3-24 lowercase letters, digits or hyphens."
  }
}

variable "object_lock_days" {
  description = "Default GOVERNANCE-mode retention for every state object version. Overwrites create new versions, so this protects history, not the current state."
  type        = number
  default     = 30

  validation {
    condition     = var.object_lock_days >= 1 && var.object_lock_days <= 365
    error_message = "object_lock_days must be between 1 and 365."
  }
}

variable "noncurrent_version_days" {
  description = "Days before an old state version expires. Must exceed object_lock_days or S3 cannot expire it."
  type        = number
  default     = 90
}

variable "organization_id" {
  description = "The AWS Organization ID (o-xxxxxxxxxx). Null on the first apply, before the org stack exists; set it and re-apply so the CI roles in member accounts can reach their state."
  type        = string
  default     = null
}

variable "shared_state_stacks" {
  description = "Stacks whose outputs other stacks read through terraform_remote_state. Every CI role in the organization may read (never write) these."
  type        = list(string)
  default     = ["bootstrap", "org", "baseline", "github-oidc", "dns"]
}

variable "stacks" {
  description = <<-EOT
    Every member-account stack whose state lives in this bucket, mapped to
    the repository whose CI roles may read and write it. The foundation
    stacks (bootstrap, org, baseline, baseline-account, github-oidc) are not
    listed: they run as the management account's own
    gha-oss-monorepo-foundation-* roles, which reach this bucket through
    their identity policies. A stack's state sits under
    stacks/<stack>/, and only roles named gha-<repo>-<stack>-plan or
    gha-<repo>-<stack>-apply, in an account of this organization, reach it.
  EOT
  type        = map(string)
  default = {
    spend-guards    = "oss-monorepo"
    dns             = "oss-monorepo"
    site            = "oss-monorepo"
    edge            = "oss-monorepo"
    email           = "oss-monorepo"
    saas-starter    = "oss-monorepo"
    products        = "oss-monorepo"
    client-accounts = "oss-monorepo"
    payments        = "private-monorepo"
  }

  validation {
    condition     = alltrue([for repo in values(var.stacks) : contains(["oss-monorepo", "private-monorepo"], repo)])
    error_message = "A stack's repository must be oss-monorepo or private-monorepo."
  }

  validation {
    condition     = lookup(var.stacks, "payments", "private-monorepo") == "private-monorepo"
    error_message = "The payments state must never be reachable from the public repository's CI."
  }
}
