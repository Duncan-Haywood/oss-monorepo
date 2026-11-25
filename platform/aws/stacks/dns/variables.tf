variable "deploy_role_arn" {
  description = "Role OpenTofu assumes in the shared-infra account (gha-oss-monorepo-dns-plan on PRs, gha-oss-monorepo-dns-apply on main)."
  type        = string
}

variable "allowed_account_ids" {
  description = "The shared-infra account id, so a wrong role can never apply here."
  type        = list(string)
  default     = null
}

variable "zone_name" {
  type    = string
  default = "marisstella.app"
}

variable "records_file" {
  description = "Exported records (scripts/cf_export.py --out). The committed file is an unverified seed until the export runs."
  type        = string
  default     = "records.json"
}

variable "planned_file" {
  description = "Records Route 53 holds that Cloudflare does not, on purpose."
  type        = string
  default     = "planned.json"
}

variable "allow_unverified_records" {
  description = "Apply records.json even though it is a seed, not an export. Only for creating the zone early to read its nameservers; never before the nameserver change."
  type        = bool
  default     = false
}

variable "extra_records" {
  description = "Records other stacks need at names this stack owns (for example SES receiving MX or an apex TXT verification), merged into the same record set. Same shape as records.json entries."
  type = list(object({
    name   = string
    type   = string
    ttl    = number
    values = list(string)
  }))
  default = []
}

variable "query_log_retention_days" {
  type    = number
  default = 365
}

variable "logs_kms_key_arn" {
  description = "Optional CMK (security stack) for the query log group. Null uses CloudWatch's own encryption."
  type        = string
  default     = null
}

variable "extra_alias_records" {
  description = "Alias records other stacks need at names this zone serves, e.g. saas-starter's api_domain_target { name, zone_id } for its API Gateway custom domain. A name and type here must not also appear in records.json, planned.json or extra_records."
  type = list(object({
    name                   = string
    type                   = optional(string, "A")
    target_dns_name        = string
    target_zone_id         = string
    evaluate_target_health = optional(bool, false)
  }))
  default = []

  validation {
    condition     = alltrue([for r in var.extra_alias_records : contains(["A", "AAAA"], r.type)])
    error_message = "Alias records here are A or AAAA."
  }
}
