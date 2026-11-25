# Security invariants of one product, with every provider mocked (nothing touches AWS).
mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_secretsmanager_secret_version" {
    defaults = { secret_string = "{\"key_id\":\"K\",\"team_id\":\"T\",\"bundle_id\":\"app.example\",\"signing_key\":\"x\"}" }
  }
  mock_resource "aws_sns_platform_application" {
    defaults = { arn = "arn:aws:sns:us-east-1:111111111111:app/APNS/saas-starter-hello-apns" }
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
  name       = "hello"
  source_dir = "./tests"
  platform = {
    subnet_ids               = ["subnet-a", "subnet-b"]
    app_security_group_id    = "sg-app"
    db_host                  = "saas.example.us-east-1.rds.amazonaws.com"
    db_port                  = 5432
    db_connect_arn_prefix    = "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG"
    db_admin_function_name   = "saas-db-admin"
    kms_key_arn              = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000000"
    name_prefix              = "saas-starter"
    permissions_boundary_arn = "arn:aws:iam::111111111111:policy/workload-boundary"
  }
  auth = {
    domain_prefix        = "hello-test"
    web_callback_urls    = ["https://hello.example/auth/callback"]
    native_callback_urls = ["hello://auth/callback"]
  }
}

run "private_bucket_encrypted_tls_only" {
  command = apply
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.app.block_public_acls,
      aws_s3_bucket_public_access_block.app.block_public_policy,
      aws_s3_bucket_public_access_block.app.ignore_public_acls,
      aws_s3_bucket_public_access_block.app.restrict_public_buckets,
    ])
    error_message = "bucket must block all public access"
  }
  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.app.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    error_message = "bucket must use SSE-KMS"
  }
  assert {
    condition     = jsondecode(aws_s3_bucket_policy.app.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false" && jsondecode(aws_s3_bucket_policy.app.policy).Statement[0].Effect == "Deny"
    error_message = "bucket must deny non-TLS access"
  }
  assert {
    condition     = aws_s3_bucket_ownership_controls.app.rule[0].object_ownership == "BucketOwnerEnforced"
    error_message = "ACLs must be disabled"
  }
}

run "least_privilege_role" {
  command = apply
  assert {
    condition     = alltrue([for s in output.policy.Statement : !contains(flatten([s.Action]), "*") && !anytrue([for a in flatten([s.Action]) : endswith(a, ":*")])])
    error_message = "no wildcard actions"
  }
  assert {
    condition     = alltrue([for s in output.policy.Statement : !contains(flatten([s.Resource]), "*")])
    error_message = "no wildcard resources"
  }
  assert {
    condition     = one([for s in output.policy.Statement : s.Resource if s.Sid == "Database"]) == "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG/app_hello"
    error_message = "rds-db:connect must name only this product's database user"
  }
  assert {
    condition     = length([for s in output.policy.Statement : s if s.Sid == "Secrets"]) == 0
    error_message = "no secrets granted unless asked for"
  }
}

run "lambda_private_and_capped" {
  command = apply
  assert {
    condition     = length(aws_lambda_function.app.vpc_config[0].subnet_ids) == 2 && contains(aws_lambda_function.app.vpc_config[0].security_group_ids, "sg-app")
    error_message = "app runs inside the private subnets"
  }
  assert {
    condition     = aws_lambda_function.app.reserved_concurrent_executions == 20
    error_message = "reserved concurrency caps spend and DB connections"
  }
  assert {
    condition     = aws_lambda_function.app.environment[0].variables.DB_USER == "app_hello" && aws_lambda_function.app.environment[0].variables.NODE_EXTRA_CA_CERTS == "/var/runtime/ca-cert.pem"
    error_message = "IAM-auth DB user and RDS CA bundle are configured"
  }
  assert {
    condition     = aws_lambda_function.app.environment[0].variables.COGNITO_WEB_CLIENT_ID == output.auth.web_client_id && startswith(aws_lambda_function.app.environment[0].variables.COGNITO_DOMAIN, "https://")
    error_message = "the app gets the public sign-in values (client id, hosted domain) for its own sign-in page"
  }
  assert {
    condition     = jsondecode(aws_lambda_invocation.ensure_db.input).products == ["hello"]
    error_message = "db-admin is asked for exactly this product"
  }
}

run "sign_in_routes" {
  command = apply
  assert {
    condition     = alltrue([for r in aws_apigatewayv2_route.private : r.authorization_type == "JWT"])
    error_message = "private routes need the Cognito JWT authorizer"
  }
  assert {
    condition     = output.auth.native_client_id != null && output.auth.web_client_id != null
    error_message = "web and native clients both exist"
  }
}

run "push_grants_only_its_platform_apps" {
  command = apply
  variables {
    push = { apns_secret_name = "hello/apns" }
  }
  assert {
    condition     = one([for s in output.policy.Statement : s.Resource if s.Sid == "PushSend"]) == ["arn:aws:sns:us-east-1:111111111111:endpoint/*/saas-starter-hello-apns/*"]
    error_message = "publish only to endpoints of this product's platform application"
  }
}

run "rejects_bad_product_name" {
  command = plan
  variables {
    name = "Bad-Name"
  }
  expect_failures = [var.name]
}

run "cron_triggers_invoke_only_this_function" {
  command = apply
  variables {
    schedules = { daily = "cron(0 13 * * ? *)" }
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.scheduler[0].policy).Statement[0].Resource == aws_lambda_function.app.arn
    error_message = "scheduler may invoke only this app"
  }
  assert {
    condition     = jsondecode(aws_scheduler_schedule.this["daily"].target[0].input).__scheduled == "cron(0 13 * * ? *)"
    error_message = "the app receives the cron expression"
  }
}

run "names_boundary_and_llm_hooks" {
  command = apply
  variables {
    extra_policy_arns = ["arn:aws:iam::111111111111:policy/llm-invoke"]
    environment       = { LLM_PROVIDER = "aws", AWS_REGION = "us-east-1", ANTHROPIC_AWS_WORKSPACE_ID = "wrkspc_x" }
  }
  assert {
    condition     = startswith(aws_iam_role.app.name, "saas-starter-") && aws_iam_role.app.permissions_boundary == "arn:aws:iam::111111111111:policy/workload-boundary"
    error_message = "role named <stack>-* with the workload boundary"
  }
  assert {
    condition     = aws_iam_role_policy_attachment.extra["arn:aws:iam::111111111111:policy/llm-invoke"].role == aws_iam_role.app.name
    error_message = "stacks/llm invoke policy attached"
  }
  assert {
    condition     = aws_lambda_function.app.environment[0].variables.LLM_PROVIDER == "aws" && !contains(keys(aws_lambda_function.app.environment[0].variables), "AWS_REGION")
    error_message = "llm environment passed, reserved AWS_* dropped"
  }
}
