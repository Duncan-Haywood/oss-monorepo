# Invariants of the ci-runners stack, checked against a mocked AWS provider
# (no account, no credentials). Run: tofu init -backend=false && tofu test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_codestarconnections_connection" {
    defaults = { connection_status = "PENDING" }
  }
  mock_resource "aws_codeconnections_connection" {
    defaults = { arn = "arn:aws:codeconnections:us-east-1:123456789012:connection/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/codebuild/private-monorepo-ci" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/codebuild-private-monorepo-ci" }
  }
}

override_data {
  target = data.terraform_remote_state.org
  values = {
    outputs = { account_ids = { shared-infra = "123456789012" } }
  }
}

variables {
  state_bucket = "123456789012-tofu-state-us-east-1"
}

run "no_webhook_before_the_connection_handshake" {
  command = apply

  assert {
    condition     = length(aws_codebuild_webhook.ci) == 0
    error_message = "the webhook must wait for connection_ready (AWS cannot register it on a pending connection)"
  }
  assert {
    condition     = output.connection_status == "PENDING"
    error_message = "the connection status is reported for the apply summary"
  }
}

run "ephemeral_bounded_private_runners" {
  command = apply

  variables {
    connection_ready = true
  }

  assert {
    condition     = alltrue([for w in aws_codebuild_webhook.ci : one(w.filter_group[*].filter[0].pattern) == "WORKFLOW_JOB_QUEUED"]) && length(aws_codebuild_webhook.ci) == 2
    error_message = "one build per queued GitHub Actions job, on both projects"
  }
  assert {
    condition     = alltrue([for p in aws_codebuild_project.ci : p.source[0].location == "https://github.com/Duncan-Haywood/private-monorepo.git"])
    error_message = "runners serve the private repository only"
  }
  assert {
    condition     = alltrue([for p in aws_codebuild_project.ci : p.source[0].auth[0].type == "CODECONNECTIONS"])
    error_message = "GitHub access goes through the AWS connection, not a stored token"
  }
  assert {
    condition     = aws_codebuild_project.ci["private-monorepo-ci"].environment[0].privileged_mode == false
    error_message = "the default runner is never privileged; only the -docker project is"
  }
  assert {
    condition     = aws_codebuild_project.ci["private-monorepo-ci-docker"].environment[0].privileged_mode == true
    error_message = "the -docker runner exists for service containers"
  }
  assert {
    condition     = alltrue([for p in aws_codebuild_project.ci : p.concurrent_build_limit <= 10 && p.build_timeout <= 120])
    error_message = "spend is bounded by concurrency and timeout"
  }
  assert {
    condition     = alltrue([for p in aws_codebuild_project.ci : p.project_visibility == "PRIVATE"])
    error_message = "build logs are not public"
  }
  assert {
    condition     = aws_cloudwatch_log_group.ci.kms_key_id != null && aws_cloudwatch_log_group.ci.retention_in_days > 0
    error_message = "logs are encrypted and expire"
  }
  assert {
    condition     = aws_kms_key.ci.enable_key_rotation
    error_message = "the key rotates"
  }
}

run "role_reaches_only_its_logs_connection_and_key" {
  command = plan

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.ci.statement :
      alltrue([for r in s.resources : r != "*"])
    ])
    error_message = "no wildcard resources in the runner role"
  }
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.ci.statement :
      alltrue([for a in s.actions : !startswith(a, "iam:") && !startswith(a, "s3:") && !startswith(a, "sts:") && a != "*"])
    ])
    error_message = "the runner role has no IAM, S3, STS or wildcard actions"
  }
}

run "no_docker_runner_when_turned_off" {
  command = plan

  variables {
    docker_runner = false
  }

  assert {
    condition     = length(aws_codebuild_project.ci) == 1 && alltrue([for p in aws_codebuild_project.ci : !p.environment[0].privileged_mode])
    error_message = "with docker_runner = false nothing is privileged"
  }
}

run "public_repository_is_refused" {
  command = plan

  variables {
    github_repository = "Duncan-Haywood/oss-monorepo"
  }
  expect_failures = [var.github_repository]
}

run "large_compute_needs_a_deliberate_change" {
  command = plan

  variables {
    compute_type = "BUILD_GENERAL1_2XLARGE"
  }
  expect_failures = [var.compute_type]
}
