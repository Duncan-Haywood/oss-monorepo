# Security invariants of the organization baseline, against mocked providers.
# Plan only: the log bucket has prevent_destroy, and every asserted value is
# computed from inputs.

mock_provider "aws" {
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}
mock_provider "aws" {
  alias = "management_west"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}
mock_provider "aws" {
  alias = "log_archive"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}
mock_provider "aws" {
  alias = "security"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}
mock_provider "aws" {
  alias = "security_west"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}

variables {
  organization_id      = "o-exampleorg1"
  organization_root_id = "r-root"
  account_ids = {
    management   = "111111111111"
    log-archive  = "222222222222"
    security     = "333333333333"
    shared-infra = "444444444444"
    apps         = "555555555555"
    payments     = "666666666666"
    sandbox      = "777777777777"
  }
  trail_data_event_bucket_arns = ["arn:aws:s3:::oss-monorepo-tfstate-111111111111-us-east-1"]
}

run "log_archive_is_write_once_private_and_encrypted" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.logs.block_public_acls,
      aws_s3_bucket_public_access_block.logs.block_public_policy,
      aws_s3_bucket_public_access_block.logs.ignore_public_acls,
      aws_s3_bucket_public_access_block.logs.restrict_public_buckets,
    ])
    error_message = "The log bucket blocks all public access."
  }

  assert {
    condition     = aws_s3_bucket.logs.object_lock_enabled && one(aws_s3_bucket_object_lock_configuration.logs.rule).default_retention[0].days >= 365
    error_message = "Logs are object-locked for at least a year."
  }

  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.logs.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms" && aws_kms_key.logs.enable_key_rotation
    error_message = "Logs are KMS-encrypted with a rotating key."
  }

  assert {
    condition     = aws_s3_bucket.logs.bucket == "oss-monorepo-logs-222222222222-us-east-1"
    error_message = "The log bucket lives in log-archive."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_s3_bucket_policy.logs.policy).Statement :
      s.Effect == "Deny" && try(s.Condition.Bool["aws:SecureTransport"], "") == "false"
    ])
    error_message = "The log bucket refuses plain HTTP."
  }

  # Only AWS services write, and only for this trail or this organization.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_s3_bucket_policy.logs.policy).Statement :
      contains(["cloudtrail.amazonaws.com", "config.amazonaws.com"], try(s.Principal.Service, "")) &&
      (try(s.Condition.StringEquals["aws:SourceArn"], "") == "arn:aws:cloudtrail:us-east-1:111111111111:trail/oss-monorepo-org-trail" ||
      try(s.Condition.StringEquals["aws:SourceOrgID"], "") == "o-exampleorg1")
      if s.Effect == "Allow"
    ])
    error_message = "Every Allow on the log bucket is a scoped AWS service."
  }
}

run "org_trail_records_everything" {
  command = plan

  assert {
    condition = alltrue([
      aws_cloudtrail.org.is_organization_trail,
      aws_cloudtrail.org.is_multi_region_trail,
      aws_cloudtrail.org.include_global_service_events,
      aws_cloudtrail.org.enable_log_file_validation,
    ])
    error_message = "One validated, multi-region organization trail."
  }

  assert {
    condition     = length(aws_cloudtrail.org.advanced_event_selector) == 2
    error_message = "Management events plus state-bucket data events."
  }
}

run "security_services_are_delegated_to_security" {
  command = plan

  assert {
    condition     = alltrue([for d in aws_organizations_delegated_administrator.this : d.account_id == "333333333333"])
    error_message = "Config and Access Analyzer are administered from the security account."
  }

  assert {
    condition     = aws_securityhub_organization_admin_account.this.admin_account_id == "333333333333"
    error_message = "Security Hub is administered from the security account."
  }

  assert {
    condition = alltrue([
      for std in ["aws-foundational-security-best-practices", "cis-aws-foundations-benchmark"] :
      anytrue([for a in one(aws_securityhub_configuration_policy.baseline.configuration_policy).enabled_standard_arns : strcontains(a, std)])
    ])
    error_message = "FSBP and CIS are enabled everywhere."
  }

  assert {
    condition     = aws_securityhub_configuration_policy_association.root.target_id == "r-root"
    error_message = "The Security Hub policy covers the whole organization."
  }

  assert {
    condition     = one(aws_securityhub_organization_configuration.this.organization_configuration).configuration_type == "CENTRAL"
    error_message = "Security Hub uses central configuration."
  }
}

run "high_findings_reach_the_queue" {
  command = plan

  assert {
    condition     = contains(jsondecode(aws_cloudwatch_event_rule.findings.event_pattern).detail.findings.Severity.Label, "CRITICAL")
    error_message = "Critical findings are exported."
  }

  assert {
    condition     = aws_sqs_queue.findings.sqs_managed_sse_enabled
    error_message = "The findings queue is encrypted."
  }
}

run "bad_lock_mode_refused" {
  command = plan

  variables {
    log_object_lock_mode = "NONE"
  }

  expect_failures = [var.log_object_lock_mode]
}
