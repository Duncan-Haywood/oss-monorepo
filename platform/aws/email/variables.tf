variable "region" {
  description = "SES region for sending and receiving (receiving is offered in us-east-1 and us-west-2)."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "Only the allowed regions: us-east-1, us-west-2."
  }
}

variable "deploy_role_arn" {
  description = "Role in the shared-infra account that OpenTofu assumes (gha-oss-monorepo-email-apply in CI, the -plan role for PRs)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:role/", var.deploy_role_arn))
    error_message = "deploy_role_arn must be an IAM role ARN."
  }
}

variable "state_bucket" {
  description = "The bootstrap stack's state bucket, to read the edge-api stack's outputs (inbox bucket, function)."
  type        = string
}

variable "zone_id" {
  description = "Route 53 hosted zone id of the main domain (the aws-route53-zone stack's zone_id output)."
  type        = string
}

variable "transactional_domain" {
  description = "Sending domain for receipts, resets and alerts. A subdomain of the main zone."
  type        = string
  default     = "mail.marisstella.app"
}

variable "marketing_domain" {
  description = "Sending domain for opt-in newsletters and nurture mail. A subdomain of the main zone."
  type        = string
  default     = "news.marisstella.app"
}

variable "cold_domain" {
  description = "A separately registered domain for cold B2B outreach, so its complaints never touch the main domain's reputation. Null until the owner registers one; no cold identity exists until then."
  type        = string
  default     = null
}

variable "cold_zone_id" {
  description = "Route 53 hosted zone id for cold_domain."
  type        = string
  default     = null

  validation {
    condition     = var.cold_domain == null || var.cold_zone_id != null
    error_message = "Set cold_zone_id whenever cold_domain is set."
  }
}

variable "dmarc_policy" {
  description = "DMARC policy for the sending subdomains. Start at quarantine; move to reject once reports are clean."
  type        = string
  default     = "quarantine"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy is none, quarantine or reject."
  }
}

variable "dmarc_rua" {
  description = "Where aggregate DMARC reports go (mailto: URI). Null = no reports requested."
  type        = string
  default     = null
}

variable "receive_mail" {
  description = "Publish the apex MX record pointing at SES inbound. This is the cutover from Cloudflare Email Routing: leave false until the edge-api stack is verified."
  type        = bool
  default     = false
}

variable "sender_role_arns" {
  description = "Roles in other accounts (apps, sandbox) allowed to send as these identities and to read and write the consent table."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for a in var.sender_role_arns : can(regex("^arn:aws:iam::[0-9]{12}:role/", a))])
    error_message = "sender_role_arns must be IAM role ARNs (no wildcards, no account roots)."
  }
}

variable "log_retention_days" {
  description = "Retention of the events function's logs."
  type        = number
  default     = 365
}
