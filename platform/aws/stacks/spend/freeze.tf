# The spend-freeze SCP and the Budgets actions that attach it.

resource "aws_organizations_policy" "freeze" {
  name        = "spend-freeze"
  description = "Attached by an AWS Budgets action when an account passes its budget: nothing new starts. Detach to resume (README.md)."
  type        = "SERVICE_CONTROL_POLICY"
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "FreezeSpend"
      Effect = "Deny"
      Action = [
        "ec2:RunInstances",
        "ec2:StartInstances",
        "ec2:CreateNatGateway",
        "ecs:CreateService",
        "ecs:RunTask",
        "ecs:StartTask",
        "lambda:CreateFunction",
        "lambda:DeleteFunctionConcurrency",
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
  statement {
    actions = ["organizations:AttachPolicy", "organizations:DetachPolicy"]
    resources = concat(
      [aws_organizations_policy.freeze.arn],
      [for id in values(local.freezable) : "arn:aws:organizations::${local.mgmt_id}:account/${local.org.organization_id}/${id}"],
    )
  }
  statement {
    actions   = ["organizations:DescribePolicy", "organizations:ListPoliciesForTarget", "organizations:ListTargetsForPolicy"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "budgets_action" {
  name               = "budgets-spend-freeze"
  path               = "/spend-guard/"
  assume_role_policy = data.aws_iam_policy_document.budgets_trust.json
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
      policy_id  = aws_organizations_policy.freeze.id
      target_ids = [each.value]
    }
  }

  subscriber {
    address           = aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }
}
