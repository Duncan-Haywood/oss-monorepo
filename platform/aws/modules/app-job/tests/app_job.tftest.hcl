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

variables {
  name              = "grants-jobs"
  image             = "111111111111.dkr.ecr.us-east-1.amazonaws.com/grants-jobs@sha256:0000000000000000000000000000000000000000000000000000000000000000"
  subnet_ids        = ["subnet-a"]
  security_group_id = "sg-app"
  kms_key_arn       = "arn:aws:kms:us-east-1:111111111111:key/k"
  secrets           = { ANTHROPIC_API_KEY = "grants/anthropic-api-key" }
}

run "hardened_container" {
  command = apply
  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].readonlyRootFilesystem && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].user == "1000:1000"
    error_message = "read-only root filesystem, non-root user"
  }
  assert {
    condition     = output.run_task_network.awsvpcConfiguration.assignPublicIp == "DISABLED"
    error_message = "no public IP"
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.execution_secrets[0].policy).Statement[0].Resource == ["arn:aws:secretsmanager:us-east-1:111111111111:secret:grants/anthropic-api-key-??????"]
    error_message = "execution role reads only the named secrets"
  }
}

run "rejects_unpinned_image" {
  command = plan
  variables {
    image = "nginx:latest"
  }
  expect_failures = [var.image]
}
