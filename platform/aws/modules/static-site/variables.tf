variable "name" {
  description = "Short name used for every resource (bucket prefix, distribution comment, policies). Lowercase letters, digits and hyphens."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$", var.name))
    error_message = "name must be 3-32 lowercase letters, digits or hyphens."
  }
}

variable "domain_name" {
  description = "The site's apex domain, e.g. marisstella.app. Served by the distribution once enable_custom_domains is true."
  type        = string
}

variable "host_redirects" {
  description = "Extra hostnames that answer 301 to https://<domain_name><prefix><path>, as a map of hostname to path prefix (\"\" for none). Each also goes on the certificate and the distribution."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for p in values(var.host_redirects) : p == "" || can(regex("^/[a-z0-9/_-]*[a-z0-9_-]$", p))])
    error_message = "Each prefix is \"\" or a path like /grants with no trailing slash."
  }
}

variable "enable_custom_domains" {
  description = "Request the ACM certificate and attach domain_name and host_redirects to the distribution. False serves the site only on its *.cloudfront.net address (the run-both phase before the certificate validates)."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Hosted zone that holds domain_name. Used for the certificate's validation records and the alias records. Required when enable_custom_domains is true."
  type        = string
  default     = null
}

variable "manage_alias_records" {
  description = "Create A/AAAA alias records for domain_name and host_redirects in route53_zone_id. Harmless before the nameserver change (the zone is not authoritative yet)."
  type        = bool
  default     = true
}

variable "app_origins" {
  description = "Path prefixes served by another origin instead of the bucket, e.g. { grants = { domain_name = \"app.example.com\" } } serves /grants and /grants/*. Caching is disabled and every viewer header but Host is forwarded."
  type = map(object({
    domain_name = string
    origin_path = optional(string, "")
  }))
  default = {}

  validation {
    condition     = alltrue([for k in keys(var.app_origins) : can(regex("^[a-z0-9][a-z0-9-]*$", k))])
    error_message = "app_origins keys are single top-level path segments."
  }
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 (North America, Europe, Israel) is the cheapest."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200 or PriceClass_All."
  }
}

variable "waf_rate_limit" {
  description = "Requests per IP per 5 minutes before the WAF rate rule blocks. The site is static; a reader never comes close."
  type        = number
  default     = 2000

  validation {
    condition     = var.waf_rate_limit >= 100
    error_message = "AWS WAF's rate-based rules need a limit of at least 100."
  }
}

variable "waf_log_retention_days" {
  description = "Retention for the WAF log group (aws-waf-logs-<name>). A year, the security baseline's minimum."
  type        = number
  default     = 365
}

variable "access_log_bucket_domain" {
  description = "Optional S3 bucket domain (e.g. from the log-archive account) for CloudFront standard logs. The bucket must allow ACL writes from CloudFront. Null means no access logs."
  type        = string
  default     = null
}

variable "noncurrent_version_days" {
  description = "Days an overwritten or deleted object version is kept, so a bad deploy can be rolled back."
  type        = number
  default     = 30
}

variable "publisher" {
  description = "GitHub OIDC publisher role (s3 sync + invalidation only). Null creates none. subject is the exact OIDC sub claim allowed, e.g. repo:OWNER/REPO:environment:aws-prod; permissions_boundary_arn is the account's workload-boundary policy (stacks/github-oidc)."
  type = object({
    role_name                = string
    oidc_provider_arn        = string
    subject                  = string
    permissions_boundary_arn = optional(string)
  })
  default = null

  validation {
    condition     = var.publisher == null || !strcontains(try(var.publisher.subject, ""), "*")
    error_message = "publisher.subject must be exact: no wildcards."
  }
}

variable "logs_kms_key_arn" {
  description = "Optional CMK (security stack) for the WAF log group. Its key policy must allow logs.us-east-1.amazonaws.com. Null uses CloudWatch's own encryption."
  type        = string
  default     = null
}

variable "edge_origin" {
  description = "Optional: an API origin under one path of the site, e.g. stacks/edge-api's Lambda function URL at /_edge/*. Fields map to that stack's outputs: origin_domain_name, origin_path_pattern, origin_verify_header_name, cloudfront_cache_policy_id, cloudfront_origin_request_policy_id, allowed_methods. The origin strips its own prefix."
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
  description = "The value CloudFront sends in edge_origin.verify_header_name so the origin refuses requests that bypass CloudFront. Comes from stacks/edge-api's origin_verify_secret_arn (apps account), read by the apply job and passed as TF_VAR_edge_origin_verify_value; see stacks/site/README.md, \"The edge API origin\"."
  type        = string
  default     = null
  sensitive   = true
}
