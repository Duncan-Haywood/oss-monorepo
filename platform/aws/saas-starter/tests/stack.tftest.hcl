# Whole apps-account stack with providers mocked: proves the modules wire together and the
# cross-account contract with the payments stack holds.
mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-1a", "us-east-1b", "us-east-1c"] }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      resource_id        = "db-ABCDEFG"
      address            = "saas.example.us-east-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:rds!db-abc-123456", kms_key_id = "k", secret_status = "active" }]
    }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:111111111111:log-group:mock" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/mock" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:111111111111:function:mock", invoke_arn = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:111111111111:function:mock/invocations" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock", url = "https://sqs.us-east-1.amazonaws.com/111111111111/mock" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = { execution_arn = "arn:aws:execute-api:us-east-1:111111111111:abc123" }
  }
  mock_resource "aws_cognito_user_pool" {
    defaults = { arn = "arn:aws:cognito-idp:us-east-1:111111111111:userpool/us-east-1_mock" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:us-east-1:111111111111:cluster/mock" }
  }
}
mock_provider "archive" {}

variables {
  deploy_role_arn     = "arn:aws:iam::111111111111:role/gha-oss-monorepo-saas-starter-plan"
  payments_account_id = "222222222222"
  build_dir           = "./tests"
}

run "platform_only" {
  command = apply
  assert {
    condition     = output.platform.db_connect_arn_prefix == "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG" && output.platform.db_admin_function_name == "saas-db-admin"
    error_message = "platform output wires database into products"
  }
  assert {
    condition     = aws_kms_key.platform.enable_key_rotation
    error_message = "platform key rotates"
  }
  assert {
    condition     = output.example == null
    error_message = "example product off by default"
  }
}

run "with_example_product" {
  command = apply
  variables {
    example_product = { enabled = true, domain_prefix = "saas-hello-test" }
  }
  assert {
    condition     = output.example.api != null
    error_message = "example product deployed"
  }
}

run "rejects_disallowed_region" {
  command = plan
  variables {
    region = "eu-west-1"
  }
  expect_failures = [var.region]
}
