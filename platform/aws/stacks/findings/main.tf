# Findings export, files first (docs/reports/2026-11-24-cloud-provider-
# comparison.md §7, "findings exported into the repository's existing alert
# queue"). HIGH and CRITICAL Security Hub findings, which carry GuardDuty,
# Config, Access Analyzer and Inspector findings with them, go from the
# security account's aggregation region into an SQS queue. A scheduled job
# (ci/findings-to-files.yml, a draft for the owner) assumes
# gha-oss-monorepo-findings-read (stacks/github-oidc) and writes each finding
# as a file on the security-alerts branch, beside the code-scanning queue
# that .github/workflows/priv-security-alert-queue.yml keeps.

variable "account_mode" {
  description = "organization or single (stacks/org's variable of the same name). In single mode the queue is in the one account and nothing is assumed."
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
  description = "The management account's state bucket, to read the org stack's account IDs. Unused when security_account_id is set."
  type        = string
  default     = null
}

variable "security_account_id" {
  description = "Override for the org stack's account_ids[\"security\"] (tests)."
  type        = string
  default     = null
}

variable "member_role_name" {
  type    = string
  default = "OrganizationAccountAccessRole"
}

variable "queue_name" {
  description = "Must match stacks/github-oidc's findings_queue_name."
  type        = string
  default     = "security-findings"
}

variable "min_severity" {
  description = "Security Hub severity labels exported."
  type        = list(string)
  default     = ["CRITICAL", "HIGH"]
}

data "terraform_remote_state" "org" {
  count   = var.security_account_id == null ? 1 : 0
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "org/terraform.tfstate"
    region = var.region
  }
}

locals {
  security_id = var.security_account_id != null ? var.security_account_id : data.terraform_remote_state.org[0].outputs.account_ids["security"]
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [local.security_id]
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.security_id}:role/${var.member_role_name}"]
    content { role_arn = assume_role.value }
  }
  default_tags {
    tags = {
      managed-by = "platform/aws/stacks/findings"
      repository = "Duncan-Haywood/oss-monorepo"
    }
  }
}

resource "aws_sqs_queue" "findings" {
  name                      = var.queue_name
  message_retention_seconds = 1209600 # 14 days: a missed week still drains
  sqs_managed_sse_enabled   = true
}

resource "aws_cloudwatch_event_rule" "findings" {
  name        = var.queue_name
  description = "High and critical Security Hub findings to the findings queue"
  event_pattern = jsonencode({
    source        = ["aws.securityhub"]
    "detail-type" = ["Security Hub Findings - Imported"]
    detail = {
      findings = {
        Severity    = { Label = var.min_severity }
        Workflow    = { Status = ["NEW"] }
        RecordState = ["ACTIVE"]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "findings" {
  rule = aws_cloudwatch_event_rule.findings.name
  arn  = aws_sqs_queue.findings.arn
}

resource "aws_sqs_queue_policy" "findings" {
  queue_url = aws_sqs_queue.findings.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EventBridgeSends"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.findings.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.findings.arn } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.findings.arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

output "queue_url" {
  value = aws_sqs_queue.findings.id
}

output "queue_arn" {
  value = aws_sqs_queue.findings.arn
}
