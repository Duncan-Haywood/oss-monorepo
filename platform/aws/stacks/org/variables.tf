variable "region" {
  description = "Home region. Claude Platform on AWS supports all commercial regions (platform.claude.com docs, read 2026-11-24)."
  type        = string
  default     = "us-east-1"
}

variable "allowed_regions" {
  description = "Regions the region-deny SCP leaves open. Everything else is denied for non-global services."
  type        = list(string)
  default     = ["us-east-1"]
}

variable "account_email_template" {
  description = "Root email for each member account; %s is the account key (log-archive, security, ...). Member root credentials are removed by centralized root access management, so these addresses matter for AWS notices only. Route them to the agent inbox (platform/pages/cloudflare/email-routing.json) before the first apply."
  type        = string
  default     = "aws-%s@marisstella.app"

  validation {
    condition     = strcontains(var.account_email_template, "%s")
    error_message = "account_email_template must contain %s."
  }
}

variable "owner_sso_role_pattern" {
  description = "ARN pattern of the owner's IAM Identity Center role; the only principal SCPs let subscribe in AWS Marketplace (the Claude Platform on AWS sign-up is a Marketplace subscription and accepts Anthropic's terms, an owner act)."
  type        = string
  default     = "arn:aws:iam::*:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_OwnerAdmin_*"
}

variable "owner_identity_center_user_name" {
  description = "User name of the owner's IAM Identity Center user (created by the owner when enabling Identity Center). Empty skips the permission set and assignments."
  type        = string
  default     = ""
}

variable "public_repository" {
  description = "owner/name of the public repository whose GitHub Actions tokens the payments account must never accept (rcps.tf)."
  type        = string
  default     = "Duncan-Haywood/oss-monorepo"
}
