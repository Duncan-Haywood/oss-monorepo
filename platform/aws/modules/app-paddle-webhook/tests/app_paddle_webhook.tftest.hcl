mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "222222222222" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:222222222222:secret:paddle/notification-secret-AbCdEf" }
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
  source_dir        = "./tests"
  queue_url         = "https://sqs.us-east-1.amazonaws.com/111111111111/saas-entitlements"
  queue_arn         = "arn:aws:sqs:us-east-1:111111111111:saas-entitlements"
  queue_kms_key_arn = "arn:aws:kms:us-east-1:111111111111:key/q"
}

run "receiver_can_only_read_its_secret_and_send_to_the_queue" {
  command = apply
  assert {
    condition     = alltrue([for s in output.policy.Statement : !contains(flatten([s.Resource]), "*") && !anytrue([for a in flatten([s.Action]) : endswith(a, "*")])])
    error_message = "no wildcards"
  }
  assert {
    condition     = one([for s in output.policy.Statement : s.Resource if s.Sid == "Queue"]) == var.queue_arn && one([for s in output.policy.Statement : s.Action if s.Sid == "Queue"]) == "sqs:SendMessage"
    error_message = "send only, to the one queue"
  }
  assert {
    condition     = one([for s in output.policy.Statement : s.Resource if s.Sid == "Secret"]) == "arn:aws:secretsmanager:us-east-1:222222222222:secret:paddle/notification-secret-AbCdEf"
    error_message = "reads only the Paddle secret"
  }
  assert {
    condition     = aws_secretsmanager_secret.paddle.kms_key_id == aws_kms_key.this.arn && aws_kms_key.this.enable_key_rotation
    error_message = "secret encrypted with a rotating CMK"
  }
  assert {
    condition     = aws_lambda_permission.url_invoke.invoked_via_function_url && aws_lambda_permission.url.function_url_auth_type == "NONE"
    error_message = "public invoke is limited to the function URL"
  }
  assert {
    condition     = length(aws_lambda_function.this.vpc_config) == 0 && aws_lambda_function.this.reserved_concurrent_executions == 10
    error_message = "outside any VPC, concurrency capped"
  }
}
