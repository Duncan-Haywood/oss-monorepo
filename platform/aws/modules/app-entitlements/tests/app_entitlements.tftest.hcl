mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
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
  name                  = "saas"
  payments_account_id   = "222222222222"
  source_dir            = "./tests"
  subnet_ids            = ["subnet-a", "subnet-b"]
  app_security_group_id = "sg-app"
  db_host               = "db"
  db_port               = 5432
  db_connect_arn_prefix = "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG"
  kms_key_arn           = "arn:aws:kms:us-east-1:111111111111:key/k"
}

run "only_the_payments_webhook_role_can_send" {
  command = apply
  assert {
    condition     = jsondecode(aws_sqs_queue_policy.this.policy).Statement[0].Principal.AWS == "arn:aws:iam::222222222222:role/saas-paddle-webhook" && jsondecode(aws_sqs_queue_policy.this.policy).Statement[0].Action == "sqs:SendMessage"
    error_message = "queue writable only by the payments webhook role, send only"
  }
  assert {
    condition     = jsondecode(aws_sqs_queue_policy.this.policy).Statement[1].Effect == "Deny"
    error_message = "non-TLS denied"
  }
  assert {
    condition     = aws_sqs_queue.this.kms_master_key_id == aws_kms_key.queue.arn && aws_sqs_queue.dlq.kms_master_key_id == aws_kms_key.queue.arn && aws_kms_key.queue.enable_key_rotation
    error_message = "queues encrypted with a rotating CMK"
  }
  assert {
    condition     = jsondecode(aws_sqs_queue.this.redrive_policy).maxReceiveCount == 5
    error_message = "failures go to the DLQ"
  }
}

run "consumer_least_privilege" {
  command = apply
  assert {
    condition     = alltrue([for s in output.consumer_policy.Statement : !contains(flatten([s.Resource]), "*") && !anytrue([for a in flatten([s.Action]) : endswith(a, "*")])])
    error_message = "no wildcards"
  }
  assert {
    condition     = one([for s in output.consumer_policy.Statement : s.Resource if s.Sid == "Database"]) == "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG/entitlement_writer"
    error_message = "consumer connects only as entitlement_writer"
  }
  assert {
    condition     = contains(aws_lambda_event_source_mapping.consumer.function_response_types, "ReportBatchItemFailures")
    error_message = "partial batch failures"
  }
}

run "rejects_bad_account_id" {
  command = plan
  variables {
    payments_account_id = "nope"
  }
  expect_failures = [var.payments_account_id]
}
