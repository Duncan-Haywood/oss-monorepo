# The spend-freeze SCP and the Budgets actions that attach it.
#
# Single-account mode has no SCPs: the same denies are an IAM managed policy,
# and one Budgets action (IAM_POLICY) attaches it to the account's roles when
# the budget passes freeze_at_percent. Left out, as the SCP leaves out
# OrganizationAccountAccessRole and /spend-guard/: the bootstrap's roles
# (/github/), the spend guard's, the workload CI roles (gha-*, which the
# boundary keeps everything, the Budgets role included, from touching) and
# AWS's own. The roles are read when this stack is applied, which is every
# merge to main, so a role made since joins on the next apply.

locals {
  freeze_actions = [
    "ec2:RunInstances",
    "ec2:StartInstances",
    "ec2:CreateNatGateway",
    "ec2:RequestSpotInstances",
    "ec2:RequestSpotFleet",
    "ec2:CreateFleet",
    # Auto Scaling: no new groups and no undoing the kill switch's 0/0/0.
    "autoscaling:CreateAutoScalingGroup",
    "autoscaling:UpdateAutoScalingGroup",
    "autoscaling:SetDesiredCapacity",
    "ecs:CreateService",
    "ecs:RunTask",
    "ecs:StartTask",
    "lambda:CreateFunction",
    "lambda:DeleteFunctionConcurrency",
    "lambda:UpdateEventSourceMapping",
    "rds:CreateDBInstance",
    "rds:CreateDBCluster",
    "rds:StartDBInstance",
    "rds:StartDBCluster",
    "sagemaker:CreateEndpoint",
    "sagemaker:CreateTrainingJob",
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream",
    # Claude Platform on AWS actions, from platform.claude.com/docs/en/
    # build-with-claude/claude-platform-on-aws (read 2026-11-24).
    "aws-external-anthropic:CreateInference",
    "aws-external-anthropic:CreateBatchInference",
    "ses:SendEmail",
    "ses:SendRawEmail",
    "ses:SendBulkEmail",
    "ses:PutAccountSendingAttributes",
  ]
}

resource "aws_organizations_policy" "freeze" {
  count       = local.single ? 0 : 1
  name        = "spend-freeze"
  description = "Attached by an AWS Budgets action when an account passes its budget: nothing new starts. Detach to resume (README.md)."
  type        = "SERVICE_CONTROL_POLICY"
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "FreezeSpend"
      Effect   = "Deny"
      Action   = local.freeze_actions
      Resource = "*"
      Condition = {
        ArnNotLike = {
          "aws:PrincipalArn" = [
            "arn:aws:iam::*:role/OrganizationAccountAccessRole",
            "arn:aws:iam::*:role/spend-guard/*",
          ]
        }
      }
    }]
  })
}

data "aws_iam_policy_document" "budgets_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.mgmt_id]
    }
  }
}

data "aws_iam_policy_document" "budgets_action" {
  #checkov:skip=CKV_AWS_356:the List/Describe calls in the second statement do not support resource scoping
  source_policy_documents = local.single ? [data.aws_iam_policy_document.budgets_action_single.json] : []
  dynamic "statement" {
    for_each = local.single ? [] : [1]
    content {
      actions = ["organizations:AttachPolicy", "organizations:DetachPolicy"]
      resources = concat(
        aws_organizations_policy.freeze[*].arn,
        [for id in values(local.freezable) : "arn:aws:organizations::${local.mgmt_id}:account/${local.org.organization_id}/${id}"],
      )
    }
  }
  dynamic "statement" {
    for_each = local.single ? [] : [1]
    content {
      actions   = ["organizations:DescribePolicy", "organizations:ListPoliciesForTarget", "organizations:ListTargetsForPolicy"]
      resources = ["*"]
    }
  }
}

# --- Single-account mode ----------------------------------------------------

data "aws_iam_roles" "all" {
  count = local.single ? 1 : 0
}

locals {
  freeze_candidates = local.single ? sort([
    for arn in data.aws_iam_roles.all[0].arns : element(split("/", arn), length(split("/", arn)) - 1)
    if !can(regex(":role/(github|spend-guard|aws-service-role|aws-reserved)/", arn)) && !can(regex("/(gha-[^/]*|OrganizationAccountAccessRole)$", arn))
  ]) : []
  # A Budgets IAM action names at most 100 roles.
  freeze_roles = slice(local.freeze_candidates, 0, min(100, length(local.freeze_candidates)))
}

resource "aws_iam_policy" "freeze" {
  count       = local.single ? 1 : 0
  name        = "spend-freeze"
  path        = "/spend-guard/"
  description = "Attached by an AWS Budgets action when the account passes its budget: nothing new starts. Detach to resume (README.md)."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "FreezeSpend"
      Effect   = "Deny"
      Action   = local.freeze_actions
      Resource = "*"
    }]
  })
}

data "aws_iam_policy_document" "budgets_action_single" {
  statement {
    sid       = "AttachTheFreezeOnly"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["arn:aws:iam::${local.mgmt_id}:role/*"]
    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::${local.mgmt_id}:policy/spend-guard/spend-freeze"]
    }
  }
}

resource "aws_budgets_budget_action" "freeze_single" {
  count              = local.single && length(local.freeze_roles) > 0 ? 1 : 0
  budget_name        = aws_budgets_budget.account["account"].name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budgets_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = var.freeze_at_percent
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.freeze[0].arn
      roles      = local.freeze_roles
    }
  }

  subscriber {
    address           = aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }
}

resource "aws_iam_role" "budgets_action" {
  name                 = "budgets-spend-freeze"
  path                 = "/spend-guard/"
  assume_role_policy   = data.aws_iam_policy_document.budgets_trust.json
  permissions_boundary = local.boundary
}

resource "aws_iam_role_policy" "budgets_action" {
  name   = "attach-spend-freeze"
  role   = aws_iam_role.budgets_action.id
  policy = data.aws_iam_policy_document.budgets_action.json
}

resource "aws_budgets_budget_action" "freeze" {
  for_each           = local.freezable
  budget_name        = aws_budgets_budget.account[each.key].name
  action_type        = "APPLY_SCP_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budgets_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = var.freeze_at_percent
  }

  definition {
    scp_action_definition {
      policy_id  = aws_organizations_policy.freeze[0].id
      target_ids = [each.value]
    }
  }

  subscriber {
    address           = aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }
}
