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
  deploy_role_arn          = "arn:aws:iam::111111111111:role/gha-oss-monorepo-shift-roster-apply"
  state_bucket             = "111111111111-tofu-state-us-east-1"
  permissions_boundary_arn = "arn:aws:iam::111111111111:policy/workload-boundary"
  build_dir                = "./tests"
}

run "names_and_boundary_follow_the_stack" {
  command = apply
  assert {
    condition     = startswith(module.hub.role_name, "shift-roster-") && module.hub.function_name == "shift-roster-roster-hub"
    error_message = "IAM and Lambda names start with the stack name (the CI role may only touch shift-roster-*)"
  }
  assert {
    condition     = module.hub.policy.Statement[1].Resource == "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG/app_roster_hub"
    error_message = "rds-db:connect only as this product's database user"
  }
}

run "least_privilege_no_secrets_no_wildcards" {
  command = apply
  assert {
    condition     = alltrue([for s in output.policy.Statement : !contains(flatten([s.Resource]), "*") && !anytrue([for a in flatten([s.Action]) : a == "*" || endswith(a, ":*")])])
    error_message = "no wildcard actions or resources"
  }
  assert {
    condition     = length([for s in output.policy.Statement : s if s.Sid == "Secrets"]) == 0
    error_message = "the hosted hub reads no secrets (keys are per team, hashed in its own table)"
  }
}

run "paid_gate_dark_and_db_named" {
  command = apply
  variables {
    free_teams = 2
  }
  assert {
    condition     = output.app_vars.FREE_TEAMS == "2"
    error_message = "FREE_TEAMS reaches the app"
  }
}

run "rejects_fractional_free_teams" {
  command = plan
  variables {
    free_teams = 1.5
  }
  expect_failures = [var.free_teams]
}

run "rejects_other_regions" {
  command = plan
  variables {
    region = "eu-west-1"
  }
  expect_failures = [var.region]
}
