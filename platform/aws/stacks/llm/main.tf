# Claude Platform on AWS: IAM for the apps and the CI gate.
#
# Source for every action name below: platform.claude.com/docs/en/
# build-with-claude/claude-platform-on-aws, "IAM policies" and "Before making
# API calls" (read 2026-11-24). The IAM action namespace and SigV4 service
# name are both `aws-external-anthropic`; the workspace ARN is
# arn:aws:aws-external-anthropic:{region}:{account-id}:workspace/{workspace-id}.
# The full action list lives at platform.claude.com/docs/en/api/
# claude-platform-on-aws-iam-actions (not fetched this session).

locals {
  workspace_arns = length(var.workspace_ids) > 0 ? [
    for w in var.workspace_ids : "arn:aws:aws-external-anthropic:${var.region}:${local.apps_account_id}:workspace/${w}"
  ] : ["arn:aws:aws-external-anthropic:${var.region}:${local.apps_account_id}:workspace/*"]
}

# "Enable outbound web identity federation once per account" (same page):
# the Claude Platform on AWS gateway calls STS as the caller to get a JWT it
# forwards to Anthropic; without this every request fails with "Outbound web
# identity federation is disabled for your account".
resource "aws_iam_outbound_web_identity_federation" "this" {}

data "aws_iam_policy_document" "invoke" {
  statement {
    sid = "Inference"
    actions = [
      "aws-external-anthropic:CreateInference",
      "aws-external-anthropic:CountTokens",
      "aws-external-anthropic:GetModel",
      "aws-external-anthropic:ListModels",
      "aws-external-anthropic:GetWorkspace",
    ]
    resources = local.workspace_arns
  }

  # Account-scoped actions take "Resource": "*" (a workspace ARN has no
  # effect on them, per the docs).
  statement {
    sid       = "AccountScoped"
    actions   = ["aws-external-anthropic:ListWorkspaces", "sts:TagGetWebIdentityToken"]
    resources = ["*"]
  }

  # Verbatim condition from the docs' example: only when the gateway makes
  # the call, and only for Anthropic's two audiences.
  statement {
    sid       = "GatewayWebIdentityToken"
    actions   = ["sts:GetWebIdentityToken"]
    resources = ["*"]
    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "sts:IdentityTokenAudience"
      values   = ["https://api.anthropic.com", "https://platform.claude.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:CalledViaLast"
      values   = ["aws-external-anthropic.amazonaws.com"]
    }
  }

  dynamic "statement" {
    for_each = var.allow_batch ? [1] : []
    content {
      sid = "Batches"
      actions = [
        "aws-external-anthropic:CreateBatchInference",
        "aws-external-anthropic:GetBatchInference",
        "aws-external-anthropic:ListBatchInferences",
      ]
      resources = ["*"]
    }
  }

  dynamic "statement" {
    for_each = var.allow_batch ? [] : [1]
    content {
      sid    = "NoBatches"
      effect = "Deny"
      actions = [
        "aws-external-anthropic:CreateBatchInference",
        "aws-external-anthropic:GetBatchInference",
        "aws-external-anthropic:ListBatchInferences",
      ]
      resources = ["*"]
    }
  }

  # SigV4 only: API keys (CallWithBearerToken) are bearer secrets.
  statement {
    sid       = "NoBearerTokens"
    effect    = "Deny"
    actions   = ["aws-external-anthropic:CallWithBearerToken"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "invoke" {
  name        = "claude-platform-invoke"
  description = "Call the Claude Messages API on Claude Platform on AWS (SigV4 only, no batches unless allowed)"
  policy      = data.aws_iam_policy_document.invoke.json
}

# --- Role for workloads that run on AWS (Lambda, ECS) ----------------------

data "aws_iam_policy_document" "app_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com", "ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.apps_account_id]
    }
  }
}

resource "aws_iam_role" "app_llm" {
  name                 = "app-llm"
  description          = "Products on AWS that call Claude"
  assume_role_policy   = data.aws_iam_policy_document.app_trust.json
  permissions_boundary = local.boundary
  tags = {
    # stacks/spend kill switch denies Claude to this role when the apps
    # budget is spent.
    spend-guard = "deny-on-budget"
  }
}

resource "aws_iam_role_policy_attachment" "app_llm" {
  role       = aws_iam_role.app_llm.name
  policy_arn = aws_iam_policy.invoke.arn
}

# --- Role for CI jobs on main that call Claude (the LLM gate) --------------

# One GitHub OIDC provider per account: in single-account mode the
# bootstrap's is this account's, so it is read, not made.
resource "aws_iam_openid_connect_provider" "github" {
  count          = local.single ? 0 : 1
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "bootstrap" {
  count = local.single ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_arn = local.single ? data.aws_iam_openid_connect_provider.bootstrap[0].arn : aws_iam_openid_connect_provider.github[0].arn
}

data "aws_iam_policy_document" "ci_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Main-branch runs and the aws-llm environment (limit it to main) only:
    # never pull requests, whose code an agent or stranger controls.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:environment:aws-llm",
        "repo:${var.immutable_github_repository}:ref:refs/heads/main",
        "repo:${var.immutable_github_repository}:environment:aws-llm",
      ]
    }
  }
}

resource "aws_iam_role" "ci_llm" {
  name = "github-llm-gate"
  # Single-account mode: /ci/, because the bootstrap denies github-apply any
  # change to roles under /github/ in its own account (where this one lives).
  path                 = local.single ? "/ci/" : "/github/"
  permissions_boundary = local.boundary
  description          = "GitHub Actions on main calling Claude Platform on AWS"
  assume_role_policy   = data.aws_iam_policy_document.ci_trust.json
  max_session_duration = 3600
  tags = {
    spend-guard = "deny-on-budget"
  }
}

resource "aws_iam_role_policy_attachment" "ci_llm" {
  role       = aws_iam_role.ci_llm.name
  policy_arn = aws_iam_policy.invoke.arn
}
