# The role the kill-switch Lambda assumes in this account. It can read what is
# running and stop, scale to zero or throttle it, and on resume undo exactly
# that. It cannot delete, terminate, read data or touch IAM. Mutations are
# scoped to this account's resource ARNs in the allowed regions; it has to
# reach untagged resources too, because a leaked key's miners carry no tags.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  p    = data.aws_partition.current.partition
  acct = data.aws_caller_identity.current.account_id

  region_condition = { StringEquals = { "aws:RequestedRegion" = var.allowed_regions } }
  prev_tag_only    = { "ForAllValues:StringEquals" = { "aws:TagKeys" = ["spend_guard_prev"] } }

  policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ListWhatRuns"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "autoscaling:DescribeAutoScalingGroups",
          "ecs:ListClusters",
          "ecs:ListServices",
          "ecs:DescribeServices",
          "lambda:ListFunctions",
          "lambda:ListEventSourceMappings",
          "rds:DescribeDBInstances",
          "rds:DescribeDBClusters",
          "sagemaker:ListEndpoints",
        ]
        # These list calls do not support resource-level permissions.
        Resource  = "*"
        Condition = local.region_condition
      },
      {
        Sid       = "StopAndStartInstances"
        Effect    = "Allow"
        Action    = ["ec2:StopInstances", "ec2:StartInstances"]
        Resource  = "arn:${local.p}:ec2:*:${local.acct}:instance/*"
        Condition = local.region_condition
      },
      {
        Sid       = "MarkInstances"
        Effect    = "Allow"
        Action    = ["ec2:CreateTags", "ec2:DeleteTags"]
        Resource  = "arn:${local.p}:ec2:*:${local.acct}:instance/*"
        Condition = merge(local.region_condition, local.prev_tag_only)
      },
      {
        Sid       = "ScaleGroups"
        Effect    = "Allow"
        Action    = ["autoscaling:UpdateAutoScalingGroup", "autoscaling:CreateOrUpdateTags", "autoscaling:DeleteTags"]
        Resource  = "arn:${local.p}:autoscaling:*:${local.acct}:autoScalingGroup:*:autoScalingGroupName/*"
        Condition = local.region_condition
      },
      {
        Sid       = "ScaleServices"
        Effect    = "Allow"
        Action    = ["ecs:UpdateService", "ecs:TagResource", "ecs:UntagResource"]
        Resource  = "arn:${local.p}:ecs:*:${local.acct}:service/*/*"
        Condition = local.region_condition
      },
      {
        Sid    = "ThrottleFunctions"
        Effect = "Allow"
        Action = [
          "lambda:ListTags",
          "lambda:GetFunctionConcurrency",
          "lambda:PutFunctionConcurrency",
          "lambda:DeleteFunctionConcurrency",
          "lambda:TagResource",
          "lambda:UntagResource",
        ]
        Resource  = "arn:${local.p}:lambda:*:${local.acct}:function:*"
        Condition = local.region_condition
      },
      {
        Sid       = "DetachEventSources"
        Effect    = "Allow"
        Action    = "lambda:UpdateEventSourceMapping"
        Resource  = "arn:${local.p}:lambda:*:${local.acct}:event-source-mapping:*"
        Condition = local.region_condition
      },
      {
        Sid    = "StopAndStartDatabases"
        Effect = "Allow"
        Action = [
          "rds:StopDBInstance",
          "rds:StartDBInstance",
          "rds:StopDBCluster",
          "rds:StartDBCluster",
          "rds:AddTagsToResource",
          "rds:RemoveTagsFromResource",
        ]
        Resource = [
          "arn:${local.p}:rds:*:${local.acct}:db:*",
          "arn:${local.p}:rds:*:${local.acct}:cluster:*",
        ]
        Condition = local.region_condition
      },
      {
        # Starting an instance whose volumes use a customer key needs a grant
        # made through EC2; nothing else.
        Sid      = "ResumeEncryptedVolumes"
        Effect   = "Allow"
        Action   = "kms:CreateGrant"
        Resource = "arn:${local.p}:kms:*:${local.acct}:key/*"
        Condition = {
          StringLike = { "kms:ViaService" = [for r in var.allowed_regions : "ec2.${r}.amazonaws.com"] }
          Bool       = { "kms:GrantIsForAWSResource" = "true" }
        }
      },
    ]
  }
}

resource "aws_iam_role" "kill_switch" {
  name                 = var.role_name
  description          = "Assumed only by the spend-guards kill-switch Lambda in the management account."
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = var.kill_switch_lambda_role_arn }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "kill_switch" {
  name   = "stop-scale-throttle"
  role   = aws_iam_role.kill_switch.id
  policy = jsonencode(local.policy)
}

output "role_arn" {
  description = "The spend-kill-switch role in this account."
  value       = aws_iam_role.kill_switch.arn
}
