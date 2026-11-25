# The stack over a mocked saas-starter state and mocked providers (nothing touches AWS).
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
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:111111111111:function:mock", invoke_arn = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:111111111111:function:mock/invocations" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = { execution_arn = "arn:aws:execute-api:us-east-1:111111111111:abc123", api_endpoint = "https://abc123.execute-api.us-east-1.amazonaws.com" }
  }
  mock_resource "aws_cognito_user_pool" {
    defaults = { arn = "arn:aws:cognito-idp:us-east-1:111111111111:userpool/us-east-1_mock" }
  }
}
mock_provider "archive" {}

override_data {
  target = data.terraform_remote_state.saas_starter
  values = {
    outputs = {
      platform = {
        subnet_ids               = ["subnet-a", "subnet-b"]
        app_security_group_id    = "sg-app"
        db_host                  = "saas.example.us-east-1.rds.amazonaws.com"
        db_port                  = 5432
        db_connect_arn_prefix    = "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG"
        db_admin_function_name   = "saas-starter-db-admin"
        kms_key_arn              = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000000"
        name_prefix              = "saas-starter"
        permissions_boundary_arn = null
      }
    }
  }
}

variables {
  deploy_role_arn          = "arn:aws:iam::111111111111:role/gha-oss-monorepo-listing-lens-apply"
  state_bucket             = "111111111111-tofu-state-us-east-1"
  permissions_boundary_arn = "arn:aws:iam::111111111111:policy/workload-boundary"
  build_dir                = "./tests"
  allowed_emails           = ["Owner@Example.com", "second@example.com"]
}

run "gate_replaces_cloudflare_access" {
  command = apply
  assert {
    condition     = output.app_vars.GATE_EMAILS == "owner@example.com,second@example.com" && output.app_vars.ROBOTS == "noindex"
    error_message = "the allow list (lower-cased) and noindex reach the site app"
  }
  assert {
    condition     = module.docs.function_name == "listing-lens-listing-docs"
    error_message = "names start with the stack (the CI role may only touch listing-lens-*)"
  }
}

run "least_privilege" {
  command = apply
  assert {
    condition     = alltrue([for s in output.policy.Statement : !contains(flatten([s.Resource]), "*") && !anytrue([for a in flatten([s.Action]) : a == "*" || endswith(a, ":*")])])
    error_message = "no wildcard actions or resources"
  }
  assert {
    condition     = length([for s in output.policy.Statement : s if s.Sid == "Secrets"]) == 0
    error_message = "no secrets: the session key lives in the product database"
  }
}

run "custom_domain_only_with_a_certificate" {
  command = apply
  variables {
    certificate_arn = "arn:aws:acm:us-east-1:111111111111:certificate/abc"
  }
  assert {
    condition     = output.api_domain_target != null
    error_message = "a certificate turns on the custom domain and its alias target"
  }
}

run "needs_an_allow_list" {
  command = plan
  variables {
    allowed_emails = []
  }
  expect_failures = [var.allowed_emails]
}

run "rejects_a_comma_inside_an_address" {
  command = plan
  variables {
    allowed_emails = ["a@b.c,evil@x.y"]
  }
  expect_failures = [var.allowed_emails]
}
