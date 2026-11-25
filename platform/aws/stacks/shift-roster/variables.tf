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
  description = "Role in the apps account that CI assumes for this stack (gha-oss-monorepo-shift-roster-plan / -apply)."
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
  description = "The apps account's workload-boundary policy (stacks/github-oidc output). Attached to every role this stack creates. null only in tests."
  type        = string
  default     = null
}

variable "build_dir" {
  description = "The bundle from `node ventures/shift-roster-builder/aws/build.mjs` (dist/app-roster_hub)."
  type        = string
  default     = null
}

variable "auth_domain_prefix" {
  description = "Cognito hosted sign-in prefix (<prefix>.auth.<region>.amazoncognito.com). Must be unused across AWS."
  type        = string
  default     = "marisstella-roster-hub"
}

variable "web_callback_urls" {
  description = "Where Cognito returns managers after sign-in (the hub's sign-in page). localhost is for development only."
  type        = list(string)
  default     = ["https://hub.marisstella.app/auth/callback"]
}

variable "custom_domain" {
  description = "{ name, certificate_arn } for the hub (regional ACM cert). null until the DNS stack serves the zone; the API's execute-api URL works meanwhile."
  type = object({
    name            = string
    certificate_arn = string
  })
  default = null
}

variable "free_teams" {
  description = "Teams a signed-in manager may create without a plan (the paid gate ships dark until checkout is live)."
  type        = number
  default     = 1
  validation {
    condition     = var.free_teams >= 0 && var.free_teams <= 25 && floor(var.free_teams) == var.free_teams
    error_message = "free_teams is a whole number from 0 to 25."
  }
}

variable "reserved_concurrency" {
  description = "Ceiling on parallel executions (spend guard; each holds at most two Postgres connections)."
  type        = number
  default     = 10
}
