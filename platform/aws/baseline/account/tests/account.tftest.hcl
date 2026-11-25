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
    target = module.baseline.data.aws_caller_identity.current
    values = { account_id = "333333333333" }
  }
  override_data {
    target = module.baseline.data.aws_region.current
    values = { region = "us-west-2" }
  }
}

variables {
  account_name       = "apps"
  account_id         = "333333333333"
  config_bucket_name = "oss-monorepo-logs-444444444444-us-east-1"
  config_kms_key_arn = "arn:aws:kms:us-east-1:444444444444:key/11111111-2222-3333-4444-555555555555"
}

run "west_is_regional_only" {
  command = plan

  variables {
    region = "us-west-2"
  }

  assert {
    condition     = length(module.baseline.config_recorder_name) > 0
    error_message = "A Config recorder in every region."
  }
}

run "unapproved_region_refused" {
  command = plan

  variables {
    region = "eu-west-1"
  }

  expect_failures = [var.region]
}
