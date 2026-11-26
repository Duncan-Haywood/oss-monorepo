variable "region" {
  description = "Home region (allowed: us-east-2, us-east-1, us-west-2)."
  type        = string
  default     = "us-east-2"
  validation {
    condition     = contains(["us-east-2", "us-east-1", "us-west-2"], var.region)
    error_message = "region must be us-east-2, us-east-1 or us-west-2."
  }
}

variable "deploy_role_arn" {
  description = "Role in the apps account that CI assumes for this stack (gha-oss-monorepo-ai-first-markets-plan / -apply)."
  type        = string
}

variable "allowed_account_ids" {
  description = "Guard against applying to the wrong account: [apps account id]. null = no guard (tests)."
  type        = list(string)
  default     = null
}

variable "state_bucket" {
  description = "The apps account's state bucket (bootstrap output); also holds saas-starter's state."
  type        = string
}

variable "saas_starter_state_key" {
  description = "State key of the saas-starter stack (convention: <stack>/terraform.tfstate)."
  type        = string
  default     = "saas-starter/terraform.tfstate"
}

variable "permissions_boundary_arn" {
  description = "The apps account's workload-boundary policy (stacks/github-oidc output). null only in tests."
  type        = string
  default     = null
}

variable "build_dir" {
  description = "The bundle from `node build.mjs site ai_first_markets <ventures/ai-first-markets/aws/out>` in saas-starter/runtime."
  type        = string
  default     = null
}

variable "allowed_emails" {
  description = "Who may read it (replaces ALLOWED_EMAIL and the Google OAuth sign-in). Set from a repository variable, not committed."
  type        = list(string)
  validation {
    condition     = length(var.allowed_emails) > 0 && alltrue([for e in var.allowed_emails : can(regex("^[^@,\\s]+@[^@,\\s]+$", e))])
    error_message = "allowed_emails needs at least one address, and no commas or spaces inside one."
  }
}

variable "site_domain" {
  description = "Where the app is served once the DNS stack points at them; the sign-in callback is https://<site_domain>/auth/login."
  type        = string
  default     = "markets.marisstella.app"
}

variable "certificate_arn" {
  description = "Regional ACM certificate for site_domain. null until it exists (then the API's execute-api URL serves, but sign-in cannot return there)."
  type        = string
  default     = null
}

variable "auth_domain_prefix" {
  description = "Cognito hosted sign-in prefix; must be unused across AWS."
  type        = string
  default     = "marisstella-ai-first-markets"
}
