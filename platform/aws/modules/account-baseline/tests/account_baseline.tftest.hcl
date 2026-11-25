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
  override_data {
    target = data.aws_caller_identity.current
    values = { account_id = "333333333333" }
  }
  override_data {
    target = data.aws_region.current
    values = { region = "us-east-1" }
  }
}

variables {
  account_name       = "apps"
  config_bucket_name = "oss-monorepo-logs-444444444444-us-east-1"
  config_kms_key_arn = "arn:aws:kms:us-east-1:444444444444:key/11111111-2222-3333-4444-555555555555"
}

run "home_region_locks_down_the_account" {
  command = plan

  variables {
    manage_global_resources = true
  }

  assert {
    condition = alltrue([
      aws_s3_account_public_access_block.this[0].block_public_acls,
      aws_s3_account_public_access_block.this[0].block_public_policy,
      aws_s3_account_public_access_block.this[0].ignore_public_acls,
      aws_s3_account_public_access_block.this[0].restrict_public_buckets,
    ])
    error_message = "Account-level Block Public Access must be fully on."
  }

  assert {
    condition     = aws_ebs_encryption_by_default.this.enabled
    error_message = "EBS volumes must be encrypted by default."
  }

  assert {
    condition     = aws_kms_key.account.enable_key_rotation
    error_message = "The account key must rotate."
  }

  assert {
    condition     = aws_config_configuration_recorder.this.recording_group[0].all_supported && aws_config_configuration_recorder.this.recording_group[0].include_global_resource_types
    error_message = "Config records everything, global types included, in the home region."
  }

  assert {
    condition     = aws_config_delivery_channel.this.s3_kms_key_arn == var.config_kms_key_arn
    error_message = "Config snapshots are encrypted with the log-archive key."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_kms_key.account.policy).Statement :
      try(s.Condition.StringEquals["kms:CallerAccount"], "333333333333") == "333333333333"
    ])
    error_message = "Only this account may use its key."
  }
}

run "second_region_skips_account_wide_settings" {
  command = plan

  variables {
    manage_global_resources = false
  }

  assert {
    condition     = length(aws_s3_account_public_access_block.this) == 0 && length(aws_iam_service_linked_role.config) == 0
    error_message = "Account-wide resources exist once, in the home region."
  }

  assert {
    condition     = !aws_config_configuration_recorder.this.recording_group[0].include_global_resource_types
    error_message = "Global resource types are recorded only once."
  }
}
