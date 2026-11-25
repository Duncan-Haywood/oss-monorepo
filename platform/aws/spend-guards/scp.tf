# The hard line, part 1: a service control policy that AWS Budgets attaches to
# an account when it crosses its hard line. It denies the calls that start or
# grow spend. It does not stop what is already running (that is the kill
# switch's job) and it does not touch reads, logs, state, DNS or storage.
#
# The kill-switch role is exempt so it can scale things down and, on resume,
# back up. Its trust policy admits only the kill-switch Lambda's role.

locals {
  deny_new_spend_actions = [
    # compute
    "ec2:RunInstances",
    "ec2:StartInstances",
    "ec2:RequestSpotInstances",
    "ec2:RequestSpotFleet",
    "ec2:CreateFleet",
    "ec2:CreateNatGateway",
    "ec2:AllocateAddress",
    "ec2:PurchaseReservedInstancesOffering",
    "ec2:PurchaseHostReservation",
    "ec2:AllocateHosts",
    "autoscaling:CreateAutoScalingGroup",
    "autoscaling:UpdateAutoScalingGroup",
    "autoscaling:SetDesiredCapacity",
    "autoscaling:ExecutePolicy",
    "application-autoscaling:RegisterScalableTarget",
    "ecs:CreateService",
    "ecs:UpdateService",
    "ecs:RunTask",
    "ecs:StartTask",
    "eks:CreateCluster",
    "eks:CreateNodegroup",
    "eks:UpdateNodegroupConfig",
    "lightsail:Create*",
    "batch:SubmitJob",
    # serverless: no new functions or code, and no undoing the kill switch's throttle
    "lambda:CreateFunction",
    "lambda:UpdateFunctionCode",
    "lambda:PutFunctionConcurrency",
    "lambda:DeleteFunctionConcurrency",
    "lambda:PutProvisionedConcurrencyConfig",
    "lambda:CreateEventSourceMapping",
    "lambda:UpdateEventSourceMapping",
    # databases and caches
    "rds:CreateDBInstance",
    "rds:CreateDBCluster",
    "rds:StartDBInstance",
    "rds:StartDBCluster",
    "rds:ModifyDBInstance",
    "rds:ModifyDBCluster",
    "rds:RestoreDBInstanceFromDBSnapshot",
    "rds:RestoreDBClusterFromSnapshot",
    "rds:PurchaseReservedDBInstancesOffering",
    "elasticache:Create*",
    "es:CreateDomain",
    "es:CreateElasticsearchDomain",
    "redshift:CreateCluster",
    "redshift-serverless:CreateWorkgroup",
    "dynamodb:UpdateTable",
    # machine learning and models (the fastest way to a surprise bill)
    "sagemaker:Create*",
    "sagemaker:UpdateEndpoint",
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream",
    "bedrock:Converse",
    "bedrock:ConverseStream",
    "bedrock:CreateProvisionedModelThroughput",
    "bedrock:StartAsyncInvoke",
    "textract:Start*",
    "textract:Analyze*",
    "transcribe:Start*",
    # email: a leaked key sending spam costs money and reputation
    "ses:SendEmail",
    "ses:SendRawEmail",
    "ses:SendTemplatedEmail",
    "ses:SendBulkTemplatedEmail",
    "ses:SendBulkEmail",
    # commitments and marketplace
    "savingsplans:CreateSavingsPlan",
    "aws-marketplace:Subscribe",
    # RenewDomain is deliberately absent: a lapsed domain costs more than any overrun.
    "route53domains:RegisterDomain",
    "route53domains:TransferDomain",
  ]

  deny_new_spend_policy = {
    Version = "2012-10-17"
    Statement = [{
      Sid      = "DenyNewSpendPastHardLine"
      Effect   = "Deny"
      Action   = local.deny_new_spend_actions
      Resource = "*"
      Condition = {
        ArnNotLike = {
          "aws:PrincipalArn" = [local.kill_role_arn]
        }
      }
    }]
  }
}

resource "aws_organizations_policy" "deny_new_spend" {
  name        = "spend-guard-deny-new-spend"
  description = "Attached by AWS Budgets when an account crosses its hard line. Detach (reset the budget action) to resume."
  type        = "SERVICE_CONTROL_POLICY"
  content     = jsonencode(local.deny_new_spend_policy)

  lifecycle {
    precondition {
      condition     = length(jsonencode(local.deny_new_spend_policy)) <= 5120
      error_message = "SCPs are limited to 5,120 characters."
    }
  }
}

# The role AWS Budgets assumes to attach and detach that SCP. Least privilege:
# only that policy, only the accounts that opted in.
resource "aws_iam_role" "budget_actions" {
  name        = "${local.name}-budget-actions"
  description = "Assumed by AWS Budgets to attach the deny-new-spend SCP at the hard line."
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "budgets.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.mgmt_id }
        ArnLike      = { "aws:SourceArn" = "arn:${local.partition}:budgets::${local.mgmt_id}:budget/spend-*" }
      }
    }]
  })
}

locals {
  budget_actions_policy = {
    Version = "2012-10-17"
    Statement = concat(
      length(local.scp_accounts) == 0 ? [] : [{
        Sid    = "AttachDenySpendScpToOptedInAccounts"
        Effect = "Allow"
        Action = ["organizations:AttachPolicy", "organizations:DetachPolicy"]
        Resource = concat(
          [aws_organizations_policy.deny_new_spend.arn],
          [for a in values(local.scp_accounts) : "arn:${local.partition}:organizations::${local.mgmt_id}:account/${local.org_id}/${a.id}"],
        )
      }],
      [{
        Sid      = "ReadOrganization"
        Effect   = "Allow"
        Action   = ["organizations:DescribePolicy", "organizations:ListPoliciesForTarget", "organizations:ListTargetsForPolicy", "organizations:DescribeOrganization"]
        Resource = "*"
      }],
    )
  }
}

resource "aws_iam_role_policy" "budget_actions" {
  name   = "attach-deny-new-spend"
  role   = aws_iam_role.budget_actions.id
  policy = jsonencode(local.budget_actions_policy)
}
