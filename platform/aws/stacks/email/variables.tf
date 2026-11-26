variable "account_mode" {
  description = "organization or single (stacks/org's variable of the same name; the workflows set it from the repository variable AWS_ACCOUNT_MODE). In single mode every provider uses the workflow's own credentials: there are no member accounts to assume a role in."
  type        = string
  default     = "organization"

  validation {
    condition     = contains(["organization", "single"], var.account_mode)
    error_message = "account_mode must be organization or single."
  }
}

variable "region" {
  type    = string
  default = "us-east-2"
}

variable "state_bucket" {
  type = string
}

variable "member_role_name" {
  type    = string
  default = "OrganizationAccountAccessRole"
}

variable "domains" {
  description = <<-EOT
    Sending domains, by purpose. Each gets an SES domain identity with Easy
    DKIM (RSA 2048), a custom MAIL FROM subdomain and the purpose's
    configuration set. Defaults: transactional mail from the apex and
    marketing from a subdomain, so a marketing complaint rate cannot hurt
    sign-in and receipt mail. Cold outbound needs its own registered domain
    (aws-ses-email in portfolio/work/tasks.yaml); buying one is an owner step,
    so it is not listed until it exists.
  EOT
  type = map(object({
    domain      = string
    mail_from   = string
    dmarc       = bool
    description = string
  }))
  default = {
    transactional = {
      domain      = "marisstella.app"
      mail_from   = "bounce.marisstella.app"
      dmarc       = true
      description = "sign-in links, receipts, account notices"
    }
    marketing = {
      domain      = "news.marisstella.app"
      mail_from   = "bounce.news.marisstella.app"
      dmarc       = false # inherits the apex's DMARC policy
      description = "newsletters and product updates to opted-in subscribers"
    }
  }
}

variable "dmarc_policy" {
  description = "DMARC p= for the apex. Start at none, read the aggregate reports, then raise to quarantine and reject."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy must be none, quarantine or reject."
  }
}

variable "dmarc_report_address" {
  description = "Where DMARC aggregate reports go (rua). Empty omits rua. The address must receive mail (Cloudflare Email Routing today)."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "When the zone has moved to Route 53 (task aws-route53-zone), its ID: the records are then created there. Empty: the records are only output, for the Cloudflare step in priv-aws-apply.yml."
  type        = string
  default     = ""
}
