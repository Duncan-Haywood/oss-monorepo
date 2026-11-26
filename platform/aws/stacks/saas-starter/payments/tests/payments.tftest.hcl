mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "222222222222" }
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
  deploy_role_arn   = "arn:aws:iam::222222222222:role/payments-deploy"
  build_dir         = "./tests"
  queue_url         = "https://sqs.us-east-1.amazonaws.com/111111111111/saas-entitlements"
  queue_arn         = "arn:aws:sqs:us-east-1:111111111111:saas-entitlements"
  queue_kms_key_arn = "arn:aws:kms:us-east-1:111111111111:key/q"
}

run "receiver_role_name_matches_the_apps_queue_policy" {
  command = apply
  assert {
    condition     = output.secret_name == "paddle/notification-secret"
    error_message = "secret container named as the README says"
  }
  assert {
    condition     = module.paddle_webhook.policy.Statement[3].Resource == var.queue_arn
    error_message = "sends to the apps queue"
  }
  assert {
    condition     = module.paddle_webhook.role_name == "payments-paddle-webhook"
    error_message = "the receiver is payments-* (stacks/github-oidc's payments apply scope) and the name the apps queue accepts"
  }
}
