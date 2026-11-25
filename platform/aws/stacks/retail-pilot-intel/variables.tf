variable "region" {
  description = "Home region (allowed: us-east-1, us-west-2)."
  type        = string
  default     = "us-east-1"
  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "region must be us-east-1 or us-west-2 (the organization's allowed regions)."
  }
}

variable "deploy_role_arn" {
  description = "Role in the apps account that CI assumes for this stack (gha-oss-monorepo-retail-pilot-intel-plan / -apply)."
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
  description = "The bundle from `node build.mjs site rpi_docs <apps/docs/dist>` in saas-starter/runtime."
  type        = string
  default     = null
}

variable "allowed_emails" {
  description = "Addresses let past a server-side sign-in gate. Empty (default) = no server gate: the docs' own client passcode is the only check, as on the Worker today. Set from a repository variable, not committed."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for e in var.allowed_emails : can(regex("^[^@,\\s]+@[^@,\\s]+$", e))])
    error_message = "One address per entry, no commas or spaces inside one."
  }
}

variable "site_domain" {
  description = "Where the docs are served once the DNS stack points at them; the sign-in callback is https://<site_domain>/auth/login."
  type        = string
  default     = "pilot-docs.marisstella.app"
}

variable "certificate_arn" {
  description = "Regional ACM certificate for site_domain. null until it exists (then the API's execute-api URL serves, but sign-in cannot return there)."
  type        = string
  default     = null
}

variable "auth_domain_prefix" {
  description = "Cognito hosted sign-in prefix; must be unused across AWS."
  type        = string
  default     = "marisstella-pilot-docs"
}
