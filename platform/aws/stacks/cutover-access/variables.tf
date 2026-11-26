variable "region" {
  type    = string
  default = "us-east-1"
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
