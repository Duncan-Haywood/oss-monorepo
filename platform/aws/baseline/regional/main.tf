# Per-region organization security settings: GuardDuty with the security
# account as delegated admin and auto-enable for every account, and the
# organization-wide IAM Access Analyzer. Instantiated once per allowed region.

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.0"
      configuration_aliases = [aws.management, aws.security]
    }
  }
}

variable "security_account_id" {
  description = "The security account, delegated admin for GuardDuty."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for names."
  type        = string
}

variable "region_label" {
  description = "Region name used in resource names."
  type        = string
}

resource "aws_guardduty_organization_admin_account" "this" {
  provider         = aws.management
  admin_account_id = var.security_account_id
}

resource "aws_guardduty_detector" "security" {
  provider                     = aws.security
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
  depends_on                   = [aws_guardduty_organization_admin_account.this]
}

resource "aws_guardduty_organization_configuration" "this" {
  provider                         = aws.security
  detector_id                      = aws_guardduty_detector.security.id
  auto_enable_organization_members = "ALL"
}

# S3 data-event threat detection: cheap at this scale and watches every
# bucket. Runtime, EKS and malware scanning stay off until a workload needs
# them (each is billed per resource); turn on here when one does.
resource "aws_guardduty_organization_configuration_feature" "s3" {
  provider    = aws.security
  detector_id = aws_guardduty_detector.security.id
  name        = "S3_DATA_EVENTS"
  auto_enable = "ALL"
  depends_on  = [aws_guardduty_organization_configuration.this]
}

# External-access analyzer for the whole organization (free). The
# unused-access analyzer is billed per role and stays off for now.
resource "aws_accessanalyzer_analyzer" "org" {
  provider      = aws.security
  analyzer_name = "${var.name_prefix}-org-${var.region_label}"
  type          = "ORGANIZATION"
}

output "guardduty_detector_id" {
  description = "The security account's detector in this region."
  value       = aws_guardduty_detector.security.id
}

output "access_analyzer_arn" {
  description = "Organization analyzer in this region."
  value       = aws_accessanalyzer_analyzer.org.arn
}
