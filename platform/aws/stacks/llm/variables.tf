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
  description = "Region of the Claude Platform on AWS workspace. Workspaces are bound to one region and every commercial region is supported (platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws, read 2026-11-24)."
  type        = string
  default     = "us-east-2"
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

variable "workspace_ids" {
  description = "Claude Platform on AWS workspace IDs (wrkspc_...) the app and CI roles may call. Empty means every workspace of the apps account in var.region. Not secret: set from the repository variable CLAUDE_AWS_WORKSPACE_ID."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for w in var.workspace_ids : can(regex("^wrkspc_[A-Za-z0-9]+$", w))])
    error_message = "Workspace IDs look like wrkspc_01AbCdEf23GhIj."
  }
}

variable "allow_batch" {
  description = "Allow the Message Batches API. Off by default (the docs' example policy denies it); turn on when a product uses batches."
  type        = bool
  default     = false
}

variable "enable_bedrock_alternative" {
  description = "Also create the Amazon Bedrock policy (the documented alternative to Claude Platform on AWS). Off: the decision is Claude Platform on AWS."
  type        = bool
  default     = false
}

variable "immutable_github_repository" {
  description = "github_repository as GitHub writes it in an immutable OIDC subject, OWNER@OWNER_ID/REPO@REPO_ID (repo:<this>:...). GitHub issues this form for the repository since 2026-11 (CloudTrail on the first apply); trusts accept it beside the name form."
  type        = string
  default     = "Duncan-Haywood@49566815/oss-monorepo@1315497858"
  validation {
    condition     = can(regex("^[A-Za-z0-9-]+@[0-9]+/[A-Za-z0-9._-]+@[0-9]+$", var.immutable_github_repository))
    error_message = "immutable_github_repository is OWNER@OWNER_ID/REPO@REPO_ID, with no wildcard."
  }
}
