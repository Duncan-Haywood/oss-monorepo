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
  description = "The management account's state bucket (bootstrap.yaml). The Cloudflare stack's state and the cutover's run state live under cloudflare/ in it."
  type        = string
}

variable "member_role_name" {
  type    = string
  default = "OrganizationAccountAccessRole"
}

variable "github_repository" {
  type    = string
  default = "Duncan-Haywood/oss-monorepo"
}

variable "db_admin_function_name" {
  description = "The saas-starter db-admin Lambda (modules/app-database), the only path into Postgres the D1 copy uses."
  type        = string
  default     = "saas-starter-db-admin"
}

variable "max_session_seconds" {
  description = "One cutover run must fit; the roles cannot be held longer."
  type        = number
  default     = 3600
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
