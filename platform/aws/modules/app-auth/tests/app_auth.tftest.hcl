mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
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
  name                 = "hello"
  domain_prefix        = "hello-test"
  web_callback_urls    = ["https://hello.example/auth/callback"]
  native_callback_urls = ["hello://auth/callback"]
}

run "public_clients_use_pkce_code_flow_without_secrets" {
  command = apply
  assert {
    condition     = !aws_cognito_user_pool_client.web.generate_secret && !aws_cognito_user_pool_client.native[0].generate_secret
    error_message = "public clients must not have a secret"
  }
  assert {
    condition     = toset(aws_cognito_user_pool_client.web.allowed_oauth_flows) == toset(["code"]) && toset(aws_cognito_user_pool_client.native[0].allowed_oauth_flows) == toset(["code"])
    error_message = "authorization code flow only (no implicit)"
  }
  assert {
    condition     = aws_cognito_user_pool_client.web.prevent_user_existence_errors == "ENABLED"
    error_message = "no user enumeration"
  }
  assert {
    condition     = aws_cognito_user_pool.this.deletion_protection == "ACTIVE" && aws_cognito_user_pool.this.password_policy[0].minimum_length >= 12
    error_message = "pool protected, passwords at least 12"
  }
  assert {
    condition     = output.issuer == "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.this.id}"
    error_message = "issuer format"
  }
}

run "rejects_plain_http_callbacks" {
  command = plan
  variables {
    web_callback_urls = ["http://hello.example/cb"]
  }
  expect_failures = [var.web_callback_urls]
}
