variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket" {
  description = "OpenTofu state bucket made by bootstrap/bootstrap.yaml (<account>-tofu-state-<region>)."
  type        = string
}

variable "member_role_name" {
  description = "Role assumed in member accounts: OrganizationAccountAccessRole to apply, github/github-plan-readonly to plan. The workflows set it."
  type        = string
  default     = "OrganizationAccountAccessRole"
}

variable "log_retention_days" {
  description = "Object Lock retention for CloudTrail and Config logs."
  type        = number
  default     = 365
}

variable "log_lock_mode" {
  description = "GOVERNANCE lets a principal with s3:BypassGovernanceRetention delete early; COMPLIANCE lets nobody, root included, for the retention period. Start in GOVERNANCE; move to COMPLIANCE once the bucket's settings have settled."
  type        = string
  default     = "GOVERNANCE"

  validation {
    condition     = contains(["GOVERNANCE", "COMPLIANCE"], var.log_lock_mode)
    error_message = "log_lock_mode must be GOVERNANCE or COMPLIANCE."
  }
}

variable "security_hub_standards" {
  description = "Standards ARNs (%s = region) that Security Hub's central configuration enables everywhere. From memory of AWS's standard ARNs, not re-read this session: check with `aws securityhub describe-standards` before the first apply."
  type        = list(string)
  default = [
    "arn:aws:securityhub:%s::standards/aws-foundational-security-best-practices/v/1.0.0",
    "arn:aws:securityhub:%s::standards/cis-aws-foundations-benchmark/v/3.0.0",
  ]
}
