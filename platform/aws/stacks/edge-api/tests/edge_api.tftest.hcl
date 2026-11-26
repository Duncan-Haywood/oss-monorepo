# Security invariants of the edge-api stack, checked against a mocked AWS
# provider (no account, no credentials). Run: tofu init -backend=false && tofu test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  # Policy JSON is not checked here (the statements are, below); the mock
  # only has to be valid JSON for the resources that take it.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:123456789012:edge-api-dlq", id = "https://sqs.us-east-1.amazonaws.com/123456789012/edge-api-dlq" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::edge-api-inbox-test", bucket = "edge-api-inbox-test" }
  }
  mock_resource "aws_dynamodb_table" {
    defaults = { arn = "arn:aws:dynamodb:us-east-1:123456789012:table/edge-api" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/edge-api" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/edge-api-function" }
  }
  mock_resource "aws_lambda_function_url" {
    defaults = { function_url = "https://abc123.lambda-url.us-east-1.on.aws/" }
  }
}

mock_provider "random" {}

override_data {
  target = data.terraform_remote_state.org
  values = {
    outputs = { account_ids = { apps = "123456789012" } }
  }
}

variables {
  state_bucket             = "123456789012-tofu-state-us-east-1"
  deploy_role_arn          = "arn:aws:iam::123456789012:role/gha-oss-monorepo-edge-api-plan"
  permissions_boundary_arn = "arn:aws:iam::123456789012:policy/workload-boundary"
}

run "data_is_encrypted_recoverable_and_protected" {
  command = apply

  assert {
    condition     = aws_dynamodb_table.edge.server_side_encryption[0].enabled && aws_dynamodb_table.edge.server_side_encryption[0].kms_key_arn == aws_kms_key.edge.arn
    error_message = "The table must be encrypted with the stack's KMS key."
  }
  assert {
    condition     = aws_dynamodb_table.edge.point_in_time_recovery[0].enabled
    error_message = "Point-in-time recovery must be on."
  }
  assert {
    condition     = aws_dynamodb_table.edge.deletion_protection_enabled
    error_message = "Deletion protection must be on."
  }
  assert {
    condition     = aws_dynamodb_table.edge.billing_mode == "PAY_PER_REQUEST"
    error_message = "On-demand billing: nothing is paid at rest."
  }
  assert {
    condition     = aws_kms_key.edge.enable_key_rotation
    error_message = "KMS key rotation must be on."
  }
  assert {
    condition     = aws_cloudwatch_log_group.function.kms_key_id == aws_kms_key.edge.arn && aws_cloudwatch_log_group.function.retention_in_days > 0
    error_message = "Logs must be encrypted and expire."
  }
}

run "inbox_bucket_is_private_encrypted_and_short_lived" {
  command = apply

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.inbox.block_public_acls,
      aws_s3_bucket_public_access_block.inbox.block_public_policy,
      aws_s3_bucket_public_access_block.inbox.ignore_public_acls,
      aws_s3_bucket_public_access_block.inbox.restrict_public_buckets,
    ])
    error_message = "All four public-access blocks must be on."
  }
  assert {
    condition     = one([for r in aws_s3_bucket_server_side_encryption_configuration.inbox.rule : r.apply_server_side_encryption_by_default[0].sse_algorithm]) == "aws:kms"
    error_message = "The inbox bucket must default to SSE-KMS."
  }
  assert {
    condition     = one(aws_s3_bucket_ownership_controls.inbox.rule).object_ownership == "BucketOwnerEnforced"
    error_message = "ACLs must be disabled."
  }
  assert {
    condition     = one(aws_s3_bucket_lifecycle_configuration.inbox.rule).expiration[0].days == 1
    error_message = "Raw mail must expire from S3 after a day (the table keeps the capped copy)."
  }
  assert {
    condition = anytrue([for s in data.aws_iam_policy_document.inbox_bucket.statement :
    s.effect == "Deny" && contains(s.actions, "s3:*") && anytrue([for c in s.condition : c.variable == "aws:SecureTransport" && contains(c.values, "false")])])
    error_message = "The bucket policy must deny non-TLS access."
  }
  assert {
    condition = alltrue([for s in data.aws_iam_policy_document.inbox_bucket.statement :
    s.effect == "Deny" || alltrue([for p in s.principals : p.type == "Service"])])
    error_message = "Only the SES service may be granted access by the bucket policy."
  }
}

run "function_iam_is_least_privilege" {
  command = apply

  assert {
    condition = alltrue(flatten([for s in data.aws_iam_policy_document.function.statement :
    [for a in s.actions : !strcontains(a, "*")]]))
    error_message = "No wildcard actions in the function's policy."
  }
  assert {
    condition = alltrue([for s in data.aws_iam_policy_document.function.statement :
    s.sid == "Tracing" || !contains(s.resources, "*")])
    error_message = "Only the X-Ray statement may use Resource \"*\"."
  }
  assert {
    condition = alltrue([for s in data.aws_iam_policy_document.function.statement :
    !anytrue([for a in s.actions : startswith(a, "dynamodb:") && contains(["dynamodb:Scan", "dynamodb:DeleteTable", "dynamodb:CreateTable"], a)])])
    error_message = "The function must not scan or manage tables."
  }
  assert {
    condition     = one([for s in data.aws_iam_policy_document.assume_lambda.statement : s.principals]) != null
    error_message = "The role must be assumable by Lambda only."
  }
  assert {
    condition     = startswith(aws_iam_role.function.name, "edge-api-") && aws_iam_role.function.permissions_boundary == "arn:aws:iam::123456789012:policy/workload-boundary"
    error_message = "Roles are named edge-api-* and carry the workload boundary."
  }
}

run "function_has_caps_and_no_secret_values" {
  command = apply

  assert {
    condition     = aws_lambda_function.edge.reserved_concurrent_executions >= 1 && aws_lambda_function.edge.reserved_concurrent_executions <= 50
    error_message = "Reserved concurrency is the spend cap and must be set."
  }
  assert {
    condition     = aws_lambda_function.edge.environment[0].variables["FEEDBACK_DAILY_CAP"] == "50" && aws_lambda_function.edge.environment[0].variables["MAX_PER_SLUG_PER_DAY"] == "20000" && aws_lambda_function.edge.environment[0].variables["INBOX_DAILY_CAP"] == "200"
    error_message = "The Worker's caps must carry over unchanged."
  }
  assert {
    condition     = !contains(keys(aws_lambda_function.edge.environment[0].variables), "INBOX_TOKEN") && !contains(keys(aws_lambda_function.edge.environment[0].variables), "ORIGIN_VERIFY")
    error_message = "Secrets are referenced by id, never placed in the environment."
  }
  assert {
    condition     = aws_lambda_function.edge.kms_key_arn == aws_kms_key.edge.arn && aws_lambda_function.edge.tracing_config[0].mode == "Active"
    error_message = "Environment encrypted with the stack key; tracing on."
  }
  assert {
    condition     = aws_lambda_function.edge.dead_letter_config[0].target_arn == aws_sqs_queue.dlq.arn && aws_sqs_queue.dlq.kms_master_key_id == aws_kms_key.edge.arn
    error_message = "Failed inbound mail goes to an encrypted dead-letter queue, never dropped."
  }
  assert {
    condition     = output.origin_domain_name == "abc123.lambda-url.us-east-1.on.aws" && output.origin_path_pattern == "/_edge/*"
    error_message = "Outputs the site stack consumes must be a bare host and a path pattern."
  }
}

run "regions_are_restricted" {
  command = plan
  variables {
    region = "eu-west-1"
  }
  expect_failures = [var.region]
}

run "deploy_role_must_be_a_role_arn" {
  command = plan
  variables {
    deploy_role_arn = "AKIAEXAMPLEKEY"
  }
  expect_failures = [var.deploy_role_arn]
}

# Account modes: in single-account mode with no CI role the provider assumes
# nothing; otherwise the CI role, else the member role.
run "single_account_without_a_ci_role" {
  command = plan

  variables {
    account_mode    = "single"
    deploy_role_arn = null
  }

  assert {
    condition     = local.deploy_role_arn == null
    error_message = "single-account mode with no CI role uses the caller's own credentials"
  }
}

run "organization_without_a_ci_role" {
  command = plan

  variables {
    deploy_role_arn = null
  }

  assert {
    condition     = endswith(local.deploy_role_arn, ":role/OrganizationAccountAccessRole")
    error_message = "organization mode falls back to the member role"
  }
}
