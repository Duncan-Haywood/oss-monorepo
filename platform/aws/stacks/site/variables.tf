variable "deploy_role_arn" {
  description = "Role OpenTofu assumes in the shared-infra account (gha-oss-monorepo-site-plan on PRs, gha-oss-monorepo-site-apply on main)."
  type        = string
}

variable "allowed_account_ids" {
  description = "The shared-infra account id, so a wrong role can never apply here. Empty list disables the check (tests only)."
  type        = list(string)
  default     = null
}

variable "domain_name" {
  description = "The site's domain."
  type        = string
  default     = "marisstella.app"
}

variable "host_redirects" {
  description = "Hostnames that 301 to the apex, with a path prefix. grants. matches the grant-autopilot Worker's redirect to /grants/ (router.mjs, APP_DIRS); www. is new (it is NXDOMAIN today)."
  type        = map(string)
  default = {
    "www.marisstella.app"    = ""
    "grants.marisstella.app" = "/grants"
  }
}

variable "enable_custom_domains" {
  description = "Phase 2 of the cutover (README): request the certificate and attach marisstella.app. Phase 1 (false) serves only the cloudfront.net address."
  type        = bool
  default     = false
}

variable "app_origins" {
  description = "Paths served by an application instead of the bucket. During run-both, grants can point at the grant-autopilot Worker's own hostname; later at its AWS home (aws-move-products)."
  type = map(object({
    domain_name = string
    origin_path = optional(string, "")
  }))
  default = {}
}

variable "github_oidc_provider_arn" {
  description = "ARN of GitHub's OIDC provider in this account. Null means the one stacks/github-oidc creates in every workload account (arn:aws:iam::<this account>:oidc-provider/token.actions.githubusercontent.com)."
  type        = string
  default     = null
}

variable "create_github_oidc_provider" {
  description = "Create GitHub's OIDC provider here. Only if stacks/github-oidc has not: an account holds one provider per URL, so two stacks creating it would collide."
  type        = bool
  default     = false
}

variable "permissions_boundary_arn" {
  description = "The account's workload-boundary policy (stacks/github-oidc), attached to every role this stack creates. Null attaches none."
  type        = string
  default     = null
}

variable "github_repository" {
  description = "OWNER/REPO exactly as GitHub writes it in the OIDC sub claim."
  type        = string
  default     = "Duncan-Haywood/oss-monorepo"
}

variable "publish_environment" {
  description = "GitHub environment the publish job runs in; the role trusts only that environment."
  type        = string
  default     = "aws-prod"
}

variable "access_log_bucket_domain" {
  description = "Optional CloudFront standard-log bucket domain from the log-archive stack."
  type        = string
  default     = null
}

variable "logs_kms_key_arn" {
  description = "Optional CMK from the security stack for the WAF log group."
  type        = string
  default     = null
}

variable "edge_origin" {
  description = "stacks/edge-api's origin for /_edge/*, from its outputs (see README.md, \"The edge API origin\"). Null serves no API path."
  type = object({
    domain_name              = string
    path_pattern             = string
    verify_header_name       = optional(string, "x-origin-verify")
    cache_policy_id          = string
    origin_request_policy_id = string
    allowed_methods          = optional(list(string), ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"])
  })
  default = null
}

variable "edge_origin_verify_value" {
  description = "Value of stacks/edge-api's origin_verify_secret_arn, read by the apply job in the apps account and passed as TF_VAR_edge_origin_verify_value."
  type        = string
  default     = null
  sensitive   = true
}
