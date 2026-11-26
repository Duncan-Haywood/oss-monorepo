# GitHub OIDC trust, a state bucket, and per-stack CI roles in one workload
# account. The state of a workload stack lives in the account it describes
# (<account>-tofu-state-<region>, the same naming as bootstrap/bootstrap.yaml
# uses for the management account), so no role of one account can read
# another account's state, and payments state never sits where a public
# repository role could reach it.
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
      source = "hashicorp/aws"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id        = data.aws_caller_identity.current.account_id
  state_bucket_name = coalesce(var.state_bucket_name, "${local.account_id}-tofu-state-${var.region}")
  state_bucket_arn  = "arn:aws:s3:::${local.state_bucket_name}"
  state_kms_key_arn = length(aws_kms_key.state) > 0 ? aws_kms_key.state[0].arn : null
  github_host       = "token.actions.githubusercontent.com"
  provider_arn      = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${local.account_id}:oidc-provider/${local.github_host}"
  boundary_arn      = "arn:aws:iam::${local.account_id}:policy/workload-boundary"

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
          Resource = local.state_bucket_arn
          Condition = {
            StringLike = { "s3:prefix" = ["${stack}/*"] }
          }
        },
        {
          Sid    = "ReadOwnAndSharedState" # shared: stacks in this account others read (dns)
          Effect = "Allow"
          Action = "s3:GetObject"
          Resource = concat(
            ["${local.state_bucket_arn}/${stack}/*"],
            [for s in var.shared_state_stacks : "${local.state_bucket_arn}/${s}/terraform.tfstate"]
          )
        },
        {
          Sid      = "DecryptState"
          Effect   = "Allow"
          Action   = ["kms:Decrypt", "kms:DescribeKey"]
          Resource = local.state_kms_key_arn
        },
      ]
      write = [
        {
          Sid      = "WriteOwnState"
          Effect   = "Allow"
          Action   = ["s3:PutObject", "s3:DeleteObject"]
          Resource = "${local.state_bucket_arn}/${stack}/*"
        },
        {
          Sid      = "EncryptState"
          Effect   = "Allow"
          Action   = ["kms:Encrypt", "kms:GenerateDataKey"]
          Resource = local.state_kms_key_arn
        },
      ]
    }
  }

  # IAM names each apply role may manage: the stack's own name unless the
  # stack lists exact prefixes.
  iam_prefixes = { for stack, cfg in var.stacks : stack => coalesce(cfg.iam_prefixes, [stack]) }

  apply_iam = {
    for stack, cfg in var.stacks : stack => [
      {
        Sid    = "ManageOwnRolesWithinBoundary"
        Effect = "Allow"
        Action = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"]
        Resource = flatten([for p in local.iam_prefixes[stack] : [
          "arn:aws:iam::${local.account_id}:role/${p}-*",
          "arn:aws:iam::${local.account_id}:role/service-role/${p}-*",
        ]])
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
        Resource = flatten([for p in local.iam_prefixes[stack] : [
          "arn:aws:iam::${local.account_id}:role/${p}-*",
          "arn:aws:iam::${local.account_id}:role/service-role/${p}-*",
          "arn:aws:iam::${local.account_id}:policy/${p}-*",
        ]])
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
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://${local.github_host}"
  client_id_list = ["sts.amazonaws.com"]
}

# The boundary itself (modules/workload-boundary). In single-account mode
# stacks/org makes the account's one boundary, so create_boundary is false
# and every role here refers to that one by name.
module "boundary" {
  count      = var.create_boundary && length(var.stacks) > 0 ? 1 : 0
  source     = "../../../modules/workload-boundary"
  account_id = local.account_id
}

moved {
  from = aws_iam_policy.boundary[0]
  to   = module.boundary[0].aws_iam_policy.this
}

resource "aws_iam_role" "plan" {
  for_each             = var.stacks
  name                 = "gha-${each.value.repo}-${each.key}-plan"
  description          = "Read-only plans of ${each.key} from ${each.value.repo} pull requests"
  max_session_duration = 3600
  # Single-account mode: the CI roles share the account with the management
  # stacks, so they carry the boundary too.
  permissions_boundary = var.boundary_on_ci_roles ? local.boundary_arn : null
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
      # ReadOnlyAccess allows s3:GetObject, kms:Decrypt and data reads on
      # everything, and an Allow above cannot narrow it: only a Deny can.
      # Pull-request code runs with these credentials, so contents stay
      # unreadable apart from this stack's own (and shared) state. The list is
      # modules/account-baseline's github-plan-readonly minus lambda:GetFunction,
      # which `tofu plan` needs to refresh a Lambda function (quality round 108,
      # portfolio/quality/audits/2026-11-26-aws.json).
      {
        Sid    = "PlansReadOnlyOwnState"
        Effect = "Deny"
        Action = ["s3:GetObject", "s3:GetObjectVersion"]
        NotResource = concat(
          ["${local.state_bucket_arn}/${each.key}/*"],
          [for s in var.shared_state_stacks : "${local.state_bucket_arn}/${s}/terraform.tfstate"]
        )
      },
      {
        Sid         = "PlansDecryptOnlyState"
        Effect      = "Deny"
        Action      = "kms:Decrypt"
        NotResource = local.state_kms_key_arn
      },
      {
        Sid    = "PlansNeverReadData"
        Effect = "Deny"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:BatchGetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
          "logs:StartQuery",
          "sqs:ReceiveMessage",
          "athena:GetQueryResults",
          "cloudtrail:LookupEvents",
          "rds-data:ExecuteStatement",
        ]
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
  # Single-account mode: the CI roles share the account with the management
  # stacks, so they carry the boundary too.
  permissions_boundary = var.boundary_on_ci_roles ? local.boundary_arn : null
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
  # Single-account mode: the CI roles share the account with the management
  # stacks, so they carry the boundary too.
  permissions_boundary = var.boundary_on_ci_roles ? local.boundary_arn : null
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

# State bucket ---------------------------------------------------------------

resource "aws_kms_key" "state" {
  count                   = length(var.stacks) > 0 ? 1 : 0
  description             = "Encrypts OpenTofu state of the workload stacks in this account"
  enable_key_rotation     = true
  rotation_period_in_days = 365
  deletion_window_in_days = 30
  # The account administers the key; the stack roles get kms:Decrypt /
  # GenerateDataKey from their own identity policies, nothing else does.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AccountAdministers"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
      Action    = "kms:*"
      Resource  = "*"
    }]
  })
}

resource "aws_kms_alias" "state" {
  count         = length(var.stacks) > 0 ? 1 : 0
  name          = var.state_kms_alias
  target_key_id = aws_kms_key.state[0].key_id
}

resource "aws_s3_bucket" "state" {
  # checkov:skip=CKV_AWS_18:Access is recorded by the organization CloudTrail (stacks/baseline).
  # checkov:skip=CKV2_AWS_62:No consumer for object events.
  # checkov:skip=CKV_AWS_144:State is small, versioned and rebuildable; a second-region copy doubles cost for little.
  count  = length(var.stacks) > 0 ? 1 : 0
  bucket = local.state_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "state" {
  count  = length(var.stacks) > 0 ? 1 : 0
  bucket = aws_s3_bucket.state[0].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  count                   = length(var.stacks) > 0 ? 1 : 0
  bucket                  = aws_s3_bucket.state[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "state" {
  count  = length(var.stacks) > 0 ? 1 : 0
  bucket = aws_s3_bucket.state[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  count  = length(var.stacks) > 0 ? 1 : 0
  bucket = aws_s3_bucket.state[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state[0].arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  count  = length(var.stacks) > 0 ? 1 : 0
  bucket = aws_s3_bucket.state[0].id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 365
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

resource "aws_s3_bucket_policy" "state" {
  count  = length(var.stacks) > 0 ? 1 : 0
  bucket = aws_s3_bucket.state[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.state_bucket_arn, "${local.state_bucket_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyOtherAccounts"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.state_bucket_arn, "${local.state_bucket_arn}/*"]
        Condition = { StringNotEquals = { "aws:PrincipalAccount" = local.account_id } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.state]
}
