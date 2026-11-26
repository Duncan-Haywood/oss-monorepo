variable "region" {
  description = "SES region. Must match stacks/email. SES email receiving is listed for us-east-2 in AWS's endpoint table (General Reference, \"Amazon SES endpoints\", seen 2026-11-26): confirm it in the console before the first apply (docs/runbooks/cutover-run-day.md, step 0)."
  type        = string
  default     = "us-east-2"

  validation {
    condition     = contains(["us-east-2", "us-east-1", "us-west-2"], var.region)
    error_message = "Only the allowed regions: us-east-2, us-east-1, us-west-2."
  }
}

variable "route53_zone_id" {
  description = "The main zone's Route 53 id once it has moved there (aws-route53-zone). Empty: the inbound MX is only output (inbound_mx_record), for the Cloudflare DNS step, like stacks/email's dns_records."
  type        = string
  default     = ""
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

variable "state_bucket" {
  description = "The bootstrap state bucket, to read other stacks' outputs (org; email-ops also reads email and edge-api)."
  type        = string
}

variable "deploy_role_arn" {
  description = "Role OpenTofu assumes in the apps account: this stack's gha-oss-monorepo-<stack>-apply (or -plan) role once the github-oidc stack exists. Null = the organisation member role."
  type        = string
  default     = null

  validation {
    condition     = var.deploy_role_arn == null || can(regex("^arn:aws:iam::[0-9]{12}:role/", var.deploy_role_arn))
    error_message = "deploy_role_arn must be an IAM role ARN."
  }
}

variable "member_role_name" {
  description = "The organisation's member-account role, used when deploy_role_arn is null."
  type        = string
  default     = "OrganizationAccountAccessRole"
}

variable "permissions_boundary_arn" {
  description = "The account's workload-boundary policy (github-oidc stack), attached to every role this stack creates. Null until that stack exists."
  type        = string
  default     = null
}

variable "account_mode" {
  description = "organization or single (stacks/org's variable of the same name). In single mode with no deploy_role_arn the provider uses the caller's own credentials."
  type        = string
  default     = "organization"

  validation {
    condition     = contains(["organization", "single"], var.account_mode)
    error_message = "account_mode must be organization or single."
  }
}
