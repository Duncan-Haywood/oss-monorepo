# GitHub Actions runners for the private repository, on AWS CodeBuild.
#
# Why: GitHub assigns no hosted runners to private-monorepo (every job since
# 2026-11-24 ~23:00 UTC finished with no runner and no steps), and the owner
# will not change that account (2026-11-26: "not happening"). Self-hosted
# runners do not use GitHub's hosted minutes; CodeBuild bills the job's
# compute to AWS, the one provider (owner, 2026-11-24).
#
# How: a workflow job with `runs-on: codebuild-<project>-<run_id>-<attempt>`
# is queued on GitHub; the webhook below starts one CodeBuild build per job,
# which registers as an ephemeral runner, runs that one job and is discarded.
# No runner outlives a job, so nothing one job leaves behind reaches the next.
#
# Never point this at the public oss-monorepo (variables.tf refuses it): a
# fork's pull request could then run its code on our machine.

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  log_group_name = "/aws/codebuild/${var.project_name}"
  # Two projects: the default runner, unprivileged, for every job; and a
  # Docker-capable one only for jobs that need service containers (e.g.
  # grants-aws's Postgres). A job picks one by its runs-on label.
  projects = merge(
    { (var.project_name) = { privileged = false } },
    var.docker_runner ? { "${var.project_name}-docker" = { privileged = true } } : {},
  )
}

# AWS creates GitHub connections as PENDING; the owner completes them once in
# the console (Developer Tools > Settings > Connections > Update pending
# connection), which installs the AWS Connector GitHub App on the repository.
resource "aws_codeconnections_connection" "github" {
  name          = "github-${var.project_name}"
  provider_type = "GitHub"
}

resource "aws_kms_key" "ci" {
  description             = "CodeBuild logs and build data for ${var.project_name}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "ci" {
  name          = "alias/${var.project_name}"
  target_key_id = aws_kms_key.ci.key_id
}

data "aws_iam_policy_document" "kms" {
  #checkov:skip=CKV_AWS_111:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_356:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_109:KMS key policies apply to their own key; Resource "*" means this key
  statement {
    sid       = "AccountAdmin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid       = "CloudWatchLogsForThisGroup"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${data.aws_partition.current.partition}:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:${local.log_group_name}"]
    }
  }
}

resource "aws_cloudwatch_log_group" "ci" {
  #checkov:skip=CKV_AWS_338:CI job logs are throwaway build output, kept 30 days (var.log_retention_days); the audit trail is CloudTrail's, kept 365 days in log-archive
  name              = local.log_group_name
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.ci.arn
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
    # Only CodeBuild acting for this account (confused-deputy guard).
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "ci" {
  name                 = "codebuild-${var.project_name}"
  description          = "CodeBuild runners for ${var.github_repository}: logs, the GitHub connection and the stack's KMS key, nothing else"
  assume_role_policy   = data.aws_iam_policy_document.assume.json
  permissions_boundary = local.boundary
  max_session_duration = 3600
}

# Least privilege: the job's own logs, the one connection and the one key.
# No AWS data access: jobs reach Cloudflare, npm and the rest with the
# repository's GitHub secrets, as they did on hosted runners.
data "aws_iam_policy_document" "ci" {
  statement {
    sid       = "OwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.ci.arn}:*"]
  }
  statement {
    sid       = "GitHubConnection"
    actions   = ["codeconnections:GetConnectionToken", "codeconnections:GetConnection", "codeconnections:UseConnection"]
    resources = [aws_codeconnections_connection.github.arn]
  }
  statement {
    sid       = "StackKey"
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = [aws_kms_key.ci.arn]
  }
}

resource "aws_iam_role_policy" "ci" {
  name   = "codebuild-${var.project_name}"
  role   = aws_iam_role.ci.id
  policy = data.aws_iam_policy_document.ci.json
}

resource "aws_codebuild_project" "ci" {
  for_each               = local.projects
  name                   = each.key
  description            = "Ephemeral GitHub Actions runners for ${var.github_repository}${each.value.privileged ? " (Docker: service containers)" : ""}"
  service_role           = aws_iam_role.ci.arn
  build_timeout          = var.build_timeout_minutes
  queued_timeout         = 60
  concurrent_build_limit = var.concurrent_build_limit
  encryption_key         = aws_kms_key.ci.arn
  project_visibility     = "PRIVATE"

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type    = var.compute_type
    image           = var.image
    type            = "LINUX_CONTAINER"
    privileged_mode = each.value.privileged
  }

  source {
    type            = "GITHUB"
    location        = "https://github.com/${var.github_repository}.git"
    git_clone_depth = 1

    auth {
      type     = "CODECONNECTIONS"
      resource = aws_codeconnections_connection.github.arn
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.ci.name
      status     = "ENABLED"
    }
    s3_logs {
      status = "DISABLED"
    }
  }
}

# One build per queued workflow job. Created only after the connection is
# AVAILABLE (var.connection_ready), since AWS cannot register a webhook on a
# pending connection.
resource "aws_codebuild_webhook" "ci" {
  for_each     = var.connection_ready ? aws_codebuild_project.ci : {}
  project_name = each.value.name
  build_type   = "BUILD"

  filter_group {
    filter {
      type    = "EVENT"
      pattern = "WORKFLOW_JOB_QUEUED"
    }
  }
}
