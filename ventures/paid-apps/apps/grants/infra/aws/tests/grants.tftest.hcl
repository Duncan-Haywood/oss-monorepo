# The grants product stack with every provider and the sibling stacks' state mocked: nothing
# touches AWS. Run: tofu init -backend=false && tofu validate && tofu test (docs/AWS.md).
mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/saas-starter-grants" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:111111111111:log-group:/aws/lambda/saas-starter-grants" }
  }
  mock_resource "aws_lambda_function" {
    defaults = {
      arn        = "arn:aws:lambda:us-east-1:111111111111:function:saas-starter-grants"
      invoke_arn = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:111111111111:function:saas-starter-grants/invocations"
    }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::saas-starter-grants-111111111111-us-east-1" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = { execution_arn = "arn:aws:execute-api:us-east-1:111111111111:abc123", api_endpoint = "https://abc123.execute-api.us-east-1.amazonaws.com" }
  }
  mock_resource "aws_cognito_user_pool" {
    defaults = { arn = "arn:aws:cognito-idp:us-east-1:111111111111:userpool/us-east-1_mock" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:grants/app-AbCdEf" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/mock" }
  }
  mock_resource "aws_sns_platform_application" {
    defaults = { arn = "arn:aws:sns:us-east-1:111111111111:app/APNS/mock" }
  }
}
mock_provider "archive" {}

override_data {
  target = data.terraform_remote_state.saas_starter
  values = {
    outputs = {
      platform = {
        subnet_ids               = ["subnet-11111111", "subnet-22222222"]
        app_security_group_id    = "sg-11111111"
        db_host                  = "saas.example.us-east-1.rds.amazonaws.com"
        db_port                  = 5432
        db_connect_arn_prefix    = "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG"
        db_admin_function_name   = "saas-starter-db-admin"
        kms_key_arn              = "arn:aws:kms:us-east-1:111111111111:key/platform"
        name_prefix              = "saas-starter"
        permissions_boundary_arn = "arn:aws:iam::111111111111:policy/workload-boundary"
      }
    }
  }
}

override_data {
  target = data.terraform_remote_state.llm
  values = {
    outputs = {
      invoke_policy_arn = "arn:aws:iam::111111111111:policy/llm-invoke"
      app_environment = {
        LLM_PROVIDER               = "aws"
        AWS_REGION                 = "us-east-1"
        ANTHROPIC_AWS_WORKSPACE_ID = "wrkspc_mock"
        base_url                   = "https://aws-external-anthropic.us-east-1.api.aws"
        model                      = "claude-opus-5-5"
      }
    }
  }
}

variables {
  deploy_role_arn  = "arn:aws:iam::111111111111:role/gha-private-monorepo-grants-plan"
  state_bucket     = "mock-state-bucket"
  app_url          = "https://grants-aws.example.org"
  build_dir        = "./tests"
  ses_identity_arn = "arn:aws:ses:us-east-1:111111111111:identity/example.org"
}

run "product" {
  command = apply

  assert {
    condition     = aws_secretsmanager_secret.app.name == "grants/app" && aws_secretsmanager_secret.app.kms_key_id == "arn:aws:kms:us-east-1:111111111111:key/platform"
    error_message = "the app secret is a container encrypted with the platform key"
  }
  assert {
    condition     = output.app_secret_name == "grants/app"
    error_message = "the secret name is published for the owner's one-time put-secret-value"
  }
  assert {
    condition = alltrue([
      for s in output.app_policy.Statement :
      !contains(flatten([s.Action]), "*") && !contains(flatten([s.Resource]), "*")
    ])
    error_message = "the app role has no wildcard action or resource"
  }
  assert {
    condition = anytrue([
      for s in output.app_policy.Statement :
      s.Sid == "Secrets" && contains(flatten([s.Resource]), "arn:aws:secretsmanager:us-east-1:111111111111:secret:grants/app-??????")
    ])
    error_message = "the app may read exactly its own secret"
  }
  assert {
    condition     = output.db.name == "grants" && output.db.user == "app_grants"
    error_message = "database grants, IAM role app_grants (tenant data stays in this product's database)"
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.ses_send[0].policy).Statement[0].Resource == ["arn:aws:ses:us-east-1:111111111111:identity/example.org"]
    error_message = "SES send is limited to the one identity"
  }
  assert {
    condition     = !contains(keys(local.llm_environment), "model") && local.llm_environment.LLM_PROVIDER == "aws"
    error_message = "Claude on AWS is wired, but grants keeps its own (cheapest) model"
  }
}

run "without_ses_or_llm" {
  command = plan
  variables {
    ses_identity_arn = null
    llm_state_key    = null
  }
  assert {
    condition     = length(aws_iam_role_policy.ses_send) == 0 && local.llm_environment == {}
    error_message = "no SES permission and no LLM policy unless configured"
  }
}

run "rejects_http_app_url" {
  command = plan
  variables {
    app_url = "http://grants.example.org"
  }
  expect_failures = [var.app_url]
}
