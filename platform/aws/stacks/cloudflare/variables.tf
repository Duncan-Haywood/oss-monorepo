variable "inventory_file" {
  description = "The export's inventory, relative to this stack (tests point it at a fixture)."
  type        = string
  default     = "inventory.generated.json"
}

variable "adopt" {
  description = "True only on the run that brings the switchable hostnames into state (import blocks in switch.tf). After that they are managed, and a rollback creates them afresh."
  type        = bool
  default     = false
}

variable "targets" {
  description = "Hostname -> \"cloudflare\" (serve as today) or \"aws\" (a DNS-only CNAME to the AWS endpoint). Hostnames not listed stay on Cloudflare."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for t in values(var.targets) : contains(["cloudflare", "aws"], t)])
    error_message = "Every target is \"cloudflare\" or \"aws\"."
  }
}

variable "aws_targets" {
  description = "Hostname -> the AWS endpoint it points at when its target is \"aws\" (a CloudFront or API Gateway domain name, resolved by the orchestrator from AWS, not from state)."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for v in values(var.aws_targets) : can(regex("^[a-z0-9.-]+\\.(cloudfront\\.net|amazonaws\\.com)$", v))])
    error_message = "AWS targets are CloudFront (*.cloudfront.net) or API Gateway (*.amazonaws.com) domain names."
  }
}

variable "acm_validation_records" {
  description = "ACM DNS-validation CNAMEs for the certificates the AWS endpoints serve (only those not already in the zone)."
  type = list(object({
    name  = string
    value = string
  }))
  default = []

  validation {
    condition     = alltrue([for r in var.acm_validation_records : startswith(r.name, "_") && endswith(r.value, ".acm-validations.aws.")])
    error_message = "ACM validation records are _<token>.<name> CNAMEs to *.acm-validations.aws."
  }
}

variable "ttl_cap" {
  description = "When above 0, non-proxied switchable records answer with at most this TTL (lowered a TTL ahead of the switch)."
  type        = number
  default     = 0
}

variable "aws_record_ttl" {
  description = "TTL of the CNAMEs that point at AWS: short, so a rollback propagates fast."
  type        = number
  default     = 60
}
