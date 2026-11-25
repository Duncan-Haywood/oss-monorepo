# GitHub OIDC trust and per-stack CI roles in one account.
#
# Each stack gets two roles:
#   gha-<repo>-<stack>-plan   pull requests of <repo>; ReadOnlyAccess, reads
#                             its own state, cannot read secrets or write.
#   gha-<repo>-<stack>-apply  jobs in <repo>'s `aws-prod` environment (main
#                             only); its stack's managed policies, IAM only
#                             on roles/policies named <stack>-*, and every
#                             role it creates must carry the account's
#                             permissions boundary.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  github_host  = "token.actions.githubusercontent.com"
  provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${local.account_id}:oidc-provider/${local.github_host}"
  boundary_arn = "arn:aws:iam::${local.account_id}:policy/workload-boundary"

  trust = {
    for stack, cfg in var.stacks : stack => {
      plan  = "repo:${var.github_owner}/${cfg.repo}:pull_request"
      apply = "repo:${var.github_owner}/${cfg.repo}:environment:${var.apply_environment}"
    }
  }

  # Plan and apply roles read and lock state only under their own prefix.
  state_access = {
    for stack, cfg in var.stacks : stack => {
      read = [
        {
          Sid      = "ListOwnState"
          Effect   = "Allow"
          Action   = "s3:ListBucket"
          Resource = var.state_bucket_arn
          Condition = {
            StringLike = { "s3:prefix" = ["stacks/${stack}/*"] }
          }
        },
        {
          Sid    = "ReadOwnAndSharedState"
          Effect = "Allow"
          Action = "s3:GetObject"
          Resource = concat(
            ["${var.state_bucket_arn}/stacks/${stack}/*"],
            [for s in var.shared_state_stacks : "${var.state_bucket_arn}/stacks/${s}/terraform.tfstate"]
          )
        },
        {
          Sid      = "DecryptState"
          Effect   = "Allow"
          Action   = ["kms:Decrypt", "kms:DescribeKey"]
          Resource = var.state_kms_key_arn
        },
      ]
      write = [
        {
          Sid      = "WriteOwnState"
          Effect   = "Allow"
          Action   = ["s3:PutObject", "s3:DeleteObject"]
          Resource = "${var.state_bucket_arn}/stacks/${stack}/*"
        },
        {
          Sid      = "EncryptState"
          Effect   = "Allow"
          Action   = ["kms:Encrypt", "kms:GenerateDataKey"]
          Resource = var.state_kms_key_arn
        },
      ]
    }
  }

  apply_iam = {
    for stack, cfg in var.stacks : stack => [
      {
        Sid    = "ManageOwnRolesWithinBoundary"
        Effect = "Allow"
        Action = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/${stack}-*",
          "arn:aws:iam::${local.account_id}:role/service-role/${stack}-*",
        ]
        Condition = { StringEquals = { "iam:PermissionsBoundary" = local.boundary_arn } }
      },
      {
        Sid    = "ManageOwnRolesAndPolicies"
        Effect = "Allow"
        Action = [
          "iam:AttachRolePolicy", "iam:CreatePolicy", "iam:CreatePolicyVersion",
          "iam:DeletePolicy", "iam:DeletePolicyVersion", "iam:DeleteRole",
          "iam:DeleteRolePolicy", "iam:DetachRolePolicy", "iam:Get*", "iam:List*",
          "iam:PassRole", "iam:PutRolePolicy", "iam:TagPolicy", "iam:TagRole",
          "iam:UntagPolicy", "iam:UntagRole", "iam:UpdateAssumeRolePolicy",
          "iam:UpdateRole", "iam:UpdateRoleDescription",
        ]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/${stack}-*",
          "arn:aws:iam::${local.account_id}:role/service-role/${stack}-*",
          "arn:aws:iam::${local.account_id}:policy/${stack}-*",
        ]
      },
      {
        Sid      = "ServiceLinkedRoles"
        Effect   = "Allow"
        Action   = ["iam:CreateServiceLinkedRole", "iam:GetRole", "iam:ListRoles", "iam:ListPolicies", "iam:GetPolicy", "iam:GetPolicyVersion"]
        Resource = "*"
      },
      {
        Sid      = "NeverTheBoundaryOrCIRoles"
        Effect   = "Deny"
        Action   = ["iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:DeleteRolePermissionsBoundary"]
        Resource = [local.boundary_arn, "arn:aws:iam::${local.account_id}:role/gha-*"]
      },
    ]
  }

  # What any role a workload stack creates can never do, whatever policy it
  # is later given.
  boundary_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AllowWithinAccount"
        Effect   = "Allow"
        Action   = "*"
        Resource = "*"
      },
      {
        Sid    = "DenyIdentityAndOrgChanges"
        Effect = "Deny"
        Action = [
          "account:*", "iam:CreateAccessKey", "iam:CreateLoginProfile", "iam:CreateUser",
          "iam:CreateOpenIDConnectProvider", "iam:CreateSAMLProvider",
          "iam:DeleteRolePermissionsBoundary", "organizations:*", "sso:*",
        ]
        Resource = "*"
      },
      {
        Sid      = "DenyTouchingCIRolesAndBoundary"
        Effect   = "Deny"
        Action   = "iam:*"
        Resource = ["arn:aws:iam::${local.account_id}:role/gha-*", local.boundary_arn]
      },
      {
        Sid      = "DenyGovernanceBypass"
        Effect   = "Deny"
        Action   = ["s3:BypassGovernanceRetention", "kms:ScheduleKeyDeletion", "kms:DisableKey"]
        Resource = "*"
      },
    ]
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://${local.github_host}"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_policy" "boundary" {
  # checkov:skip=CKV_AWS_62:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_63:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_286:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_287:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_288:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_289:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_290:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_355:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV2_AWS_40:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  count       = length(var.stacks) > 0 ? 1 : 0
  name        = "workload-boundary"
  description = "Permissions boundary every role created by a workload stack must carry"
  policy      = jsonencode(local.boundary_policy)
}

resource "aws_iam_role" "plan" {
  for_each             = var.stacks
  name                 = "gha-${each.value.repo}-${each.key}-plan"
  description          = "Read-only plans of ${each.key} from ${each.value.repo} pull requests"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.github_host}:aud" = "sts.amazonaws.com"
          "${local.github_host}:sub" = local.trust[each.key].plan
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  for_each   = var.stacks
  role       = aws_iam_role.plan[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan" {
  for_each = var.stacks
  name     = "state-read-no-secrets"
  role     = aws_iam_role.plan[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(local.state_access[each.key].read, [
      {
        Sid      = "PlansNeverWriteOrReadSecrets"
        Effect   = "Deny"
        Action   = ["s3:PutObject", "s3:DeleteObject", "secretsmanager:GetSecretValue", "ssm:GetParameter*"]
        Resource = "*"
      },
    ])
  })
}

resource "aws_iam_role" "apply" {
  for_each             = var.stacks
  name                 = "gha-${each.value.repo}-${each.key}-apply"
  description          = "Applies ${each.key} from ${each.value.repo} main through ${var.apply_environment}"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.github_host}:aud" = "sts.amazonaws.com"
          "${local.github_host}:sub" = local.trust[each.key].apply
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apply" {
  for_each = merge([
    for stack, cfg in var.stacks : { for p in cfg.managed_policies : "${stack}|${p}" => { stack = stack, arn = p } }
  ]...)
  role       = aws_iam_role.apply[each.value.stack].name
  policy_arn = each.value.arn
}

resource "aws_iam_role_policy" "apply" {
  for_each = var.stacks
  name     = "state-and-scoped-iam"
  role     = aws_iam_role.apply[each.key].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = concat(local.state_access[each.key].read, local.state_access[each.key].write, local.apply_iam[each.key], each.value.extra_statements)
  })
}

# Roles that are not a stack's plan/apply pair (e.g. the findings reader).
resource "aws_iam_role" "extra" {
  # checkov:skip=CKV_AWS_393:The subject comes from a variable Checkov cannot resolve; it is an exact aud+sub pair, asserted in tests/github_oidc.tftest.hcl.
  for_each             = var.extra_roles
  name                 = each.key
  description          = each.value.description
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.github_host}:aud" = "sts.amazonaws.com"
          "${local.github_host}:sub" = each.value.subject
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "extra" {
  for_each = var.extra_roles
  name     = "inline"
  role     = aws_iam_role.extra[each.key].id
  policy   = jsonencode({ Version = "2012-10-17", Statement = each.value.statements })
}
