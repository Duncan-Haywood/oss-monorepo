# What every account gets, management included (docs/reports/
# 2026-11-24-cloud-provider-comparison.md §7, "Security baseline"):
# account-level S3 Block Public Access, default EBS encryption, a CIS password
# policy, an AWS Config recorder delivering to the log-archive bucket, a
# read-only role for pull-request plans, and the role the spend kill switch
# assumes. GuardDuty, Security Hub and Access Analyzer are enabled
# organisation-wide from the security account (stacks/baseline/security.tf).

data "aws_partition" "this" {}
data "aws_caller_identity" "this" {}
data "aws_region" "this" {}

resource "aws_s3_account_public_access_block" "this" {
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_ebs_encryption_by_default" "this" {
  enabled = true
}

# CIS AWS Foundations 1.8/1.9. IAM users are denied by SCP anyway; this
# covers the transitional one and any break-glass user.
resource "aws_iam_account_password_policy" "this" {
  #checkov:skip=CKV_AWS_9:forced periodic expiry is against NIST SP 800-63B and dropped from CIS v3; no IAM users log in anyway
  minimum_password_length        = 14
  password_reuse_prevention      = 24
  require_lowercase_characters   = true
  require_uppercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
}

resource "aws_iam_service_linked_role" "config" {
  aws_service_name = "config.amazonaws.com"
}

resource "aws_config_configuration_recorder" "this" {
  name     = "default"
  role_arn = aws_iam_service_linked_role.config.arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = var.record_global_resources
  }
}

resource "aws_config_delivery_channel" "this" {
  name           = "default"
  s3_bucket_name = var.log_bucket_name
  s3_key_prefix  = "config"
  s3_kms_key_arn = var.log_kms_key_arn

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }

  depends_on = [aws_config_configuration_recorder.this]
}

resource "aws_config_configuration_recorder_status" "this" {
  name       = aws_config_configuration_recorder.this.name
  is_enabled = true
  depends_on = [aws_config_delivery_channel.this]
}

# --- Read-only role for `tofu plan` on pull requests (member accounts) -----

data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.this.partition}:iam::${var.management_account_id}:role/github/github-plan"]
    }
  }
}

data "aws_iam_policy_document" "plan_deny_data" {
  # Same denies as the bootstrap's github-plan role: configuration is
  # readable, contents are not (pull-request code runs with these creds).
  statement {
    sid    = "NoDataReads"
    effect = "Deny"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "kms:Decrypt",
      "secretsmanager:GetSecretValue",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "ssm:GetParameterHistory",
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:StartQuery",
      "lambda:GetFunction",
      "sqs:ReceiveMessage",
      "athena:GetQueryResults",
      "cloudtrail:LookupEvents",
      "rds-data:ExecuteStatement",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "plan" {
  count                = var.is_management ? 0 : 1
  name                 = "github-plan-readonly"
  path                 = "/github/"
  description          = "Assumed by the management account's github-plan role for tofu plan"
  assume_role_policy   = data.aws_iam_policy_document.plan_trust.json
  max_session_duration = 3600
  permissions_boundary = var.permissions_boundary_arn
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  count      = var.is_management ? 0 : 1
  role       = aws_iam_role.plan[0].name
  policy_arn = "arn:${data.aws_partition.this.partition}:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_deny_data" {
  count  = var.is_management ? 0 : 1
  name   = "deny-data-reads"
  role   = aws_iam_role.plan[0].id
  policy = data.aws_iam_policy_document.plan_deny_data.json
}

# --- Role the spend kill switch (stacks/spend) assumes -----------------------

data "aws_iam_policy_document" "kill_switch_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.this.partition}:iam::${var.management_account_id}:role/spend-guard/spend-kill-switch"]
    }
  }
}

data "aws_iam_policy_document" "kill_switch" {
  #checkov:skip=CKV_AWS_111:must stop whatever runs in the account, so it cannot name resources in advance; writes on IAM are tag-conditioned
  #checkov:skip=CKV_AWS_356:must stop whatever runs in the account, so it cannot name resources in advance
  statement {
    sid = "Discover"
    actions = [
      "ec2:DescribeInstances",
      "lambda:ListFunctions",
      "lambda:GetFunctionConcurrency",
      "lambda:ListTags",
      "ecs:ListClusters",
      "ecs:ListServices",
      "ecs:DescribeServices",
      "ecs:ListTagsForResource",
      "rds:DescribeDBInstances",
      "rds:DescribeDBClusters",
      "rds:ListTagsForResource",
      "autoscaling:DescribeAutoScalingGroups",
      "lambda:ListEventSourceMappings",
      "sagemaker:ListEndpoints",
      "iam:ListRoles",
      "iam:ListRoleTags",
      "iam:ListUsers",
      "iam:ListUserTags",
      "iam:ListRolePolicies",
      "iam:ListUserPolicies",
      "ses:GetAccount",
    ]
    resources = ["*"]
  }

  statement {
    sid = "StopAndResume"
    actions = [
      "ec2:StopInstances",
      "ec2:StartInstances",
      "ec2:CreateTags",
      "ec2:DeleteTags",
      "lambda:PutFunctionConcurrency",
      "lambda:DeleteFunctionConcurrency",
      "lambda:TagResource",
      "lambda:UntagResource",
      "ecs:UpdateService",
      "ecs:TagResource",
      "ecs:UntagResource",
      "rds:StopDBInstance",
      "rds:StartDBInstance",
      "rds:StopDBCluster",
      "rds:StartDBCluster",
      "autoscaling:UpdateAutoScalingGroup",
      "autoscaling:CreateOrUpdateTags",
      "autoscaling:DeleteTags",
      "lambda:UpdateEventSourceMapping",
      "rds:AddTagsToResource",
      "rds:RemoveTagsFromResource",
      "ses:PutAccountSendingAttributes",
    ]
    resources = ["*"]
  }

  # Cut LLM and email permissions only on principals that opted in with the
  # tag spend-guard=deny-on-budget (stacks/llm, stacks/app-identity).
  statement {
    sid = "DenyPolicyOnTaggedPrincipals"
    actions = [
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:PutUserPolicy",
      "iam:DeleteUserPolicy",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "iam:ResourceTag/spend-guard"
      values   = ["deny-on-budget"]
    }
  }
}

resource "aws_iam_role" "kill_switch" {
  name                 = "spend-kill-switch-target"
  path                 = "/spend-guard/"
  description          = "Assumed by the management account's spend kill switch"
  assume_role_policy   = data.aws_iam_policy_document.kill_switch_trust.json
  max_session_duration = 3600
  permissions_boundary = var.permissions_boundary_arn
}

resource "aws_iam_role_policy" "kill_switch" {
  name   = "stop-and-resume"
  role   = aws_iam_role.kill_switch.id
  policy = data.aws_iam_policy_document.kill_switch.json
}
