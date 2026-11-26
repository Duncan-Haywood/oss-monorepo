# Mocked: nothing touches AWS. tofu init -backend=false && tofu validate && tofu test
mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "222222222222" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::222222222222:role/saas-starter-payments-paddle-webhook" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:222222222222:log-group:/aws/lambda/saas-starter-payments-paddle-webhook" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:222222222222:key/mock" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:222222222222:function:saas-starter-payments-paddle-webhook" }
  }
  mock_resource "aws_lambda_function_url" {
    defaults = { function_url = "https://mockwebhook.lambda-url.us-east-1.on.aws/" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:222222222222:secret:paddle/notification-secret-AbCdEf" }
  }
}
mock_provider "archive" {}

variables {
  deploy_role_arn   = "arn:aws:iam::222222222222:role/gha-private-monorepo-payments-apply"
  build_dir         = "./tests"
  queue_url         = "https://sqs.us-east-1.amazonaws.com/111111111111/saas-starter-entitlements"
  queue_arn         = "arn:aws:sqs:us-east-1:111111111111:saas-starter-entitlements"
  queue_kms_key_arn = "arn:aws:kms:us-east-1:111111111111:key/q"
}

run "receiver" {
  command = apply
  assert {
    condition     = output.secret_name == "paddle/notification-secret"
    error_message = "secret container named as the starter README says"
  }
  assert {
    condition = anytrue([
      for s in module.paddle_webhook.policy.Statement : s.Resource == var.queue_arn
    ])
    error_message = "forwards only to the apps account's entitlement queue"
  }
  assert {
    condition = alltrue([
      for s in module.paddle_webhook.policy.Statement :
      !contains(flatten([s.Action]), "*") && !contains(flatten([s.Resource]), "*")
    ])
    error_message = "receiver role has no wildcard action or resource"
  }
}

run "rejects_a_non_queue_arn" {
  command = plan
  variables {
    queue_arn = "arn:aws:s3:::not-a-queue"
  }
  expect_failures = [var.queue_arn]
}
