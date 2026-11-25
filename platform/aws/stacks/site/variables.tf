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
  description = "ARN of an existing GitHub OIDC provider in this account. Null creates one here: the bootstrap (platform/aws/bootstrap) puts one only in the management account, and the llm stack creates its own in apps."
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
