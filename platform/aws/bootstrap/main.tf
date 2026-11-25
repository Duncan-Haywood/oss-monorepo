# The OpenTofu state bucket for every stack under platform/aws/.
#
# Lives in the management account: it must exist before the org stack creates
# any other account, the org-level stacks (org, baseline, github-oidc,
# spend-guards) run there, and moving it later would mean migrating every
# stack's state. Member-account CI roles reach their own prefix through the
# bucket policy below (organization ID plus exact role-name pattern).

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  partition   = data.aws_partition.current.partition
  bucket_name = "${var.name_prefix}-tfstate-${local.account_id}-${var.region}"
  bucket_arn  = "arn:${local.partition}:s3:::${local.bucket_name}"

  # Cross-account grants only exist once the organization does.
  org_grants = var.organization_id == null ? {} : var.stacks

  state_role_arns = {
    for stack, repo in local.org_grants : stack => {
      plan  = "arn:${local.partition}:iam::*:role/gha-${repo}-${stack}-plan"
      apply = "arn:${local.partition}:iam::*:role/gha-${repo}-${stack}-apply"
    }
  }

  bucket_policy = {
    Version   = "2012-10-17"
    Statement = concat(
      [
        {
          Sid       = "DenyInsecureTransport"
          Effect    = "Deny"
          Principal = "*"
          Action    = "s3:*"
          Resource  = [local.bucket_arn, "${local.bucket_arn}/*"]
          Condition = { Bool = { "aws:SecureTransport" = "false" } }
        },
        {
          Sid       = "DenyOldTLS"
          Effect    = "Deny"
          Principal = "*"
          Action    = "s3:*"
          Resource  = [local.bucket_arn, "${local.bucket_arn}/*"]
          Condition = { NumericLessThan = { "s3:TlsVersion" = "1.2" } }
        },
        {
          # Locked history stays locked: nobody shortens a retention period.
          Sid       = "DenyGovernanceBypass"
          Effect    = "Deny"
          Principal = "*"
          Action    = ["s3:BypassGovernanceRetention", "s3:PutObjectRetention", "s3:PutObjectLegalHold"]
          Resource  = "${local.bucket_arn}/*"
        },
      ],
      var.organization_id == null ? [] : [
        {
          Sid       = "AllCIRolesReadSharedOutputs"
          Effect    = "Allow"
          Principal = "*"
          Action    = "s3:GetObject"
          Resource  = [for stack in var.shared_state_stacks : "${local.bucket_arn}/stacks/${stack}/terraform.tfstate"]
          Condition = {
            StringEquals = { "aws:PrincipalOrgID" = var.organization_id }
            ArnLike      = { "aws:PrincipalArn" = flatten([for arns in values(local.state_role_arns) : [arns.plan, arns.apply]]) }
          }
        },
      ],
      flatten([
        for stack, arns in local.state_role_arns : [
          {
            Sid       = "List${replace(title(replace(stack, "-", " ")), " ", "")}"
            Effect    = "Allow"
            Principal = "*"
            Action    = "s3:ListBucket"
            Resource  = local.bucket_arn
            Condition = {
              StringEquals = { "aws:PrincipalOrgID" = var.organization_id }
              ArnLike      = { "aws:PrincipalArn" = [arns.plan, arns.apply] }
              StringLike   = { "s3:prefix" = ["stacks/${stack}/*"] }
            }
          },
          {
            Sid       = "Read${replace(title(replace(stack, "-", " ")), " ", "")}"
            Effect    = "Allow"
            Principal = "*"
            Action    = "s3:GetObject"
            Resource  = "${local.bucket_arn}/stacks/${stack}/*"
            Condition = {
              StringEquals = { "aws:PrincipalOrgID" = var.organization_id }
              ArnLike      = { "aws:PrincipalArn" = [arns.plan, arns.apply] }
            }
          },
          {
            # Only apply roles write state or take the lock. PR plans run
            # with -lock=false (read-only roles never mutate anything).
            Sid       = "Write${replace(title(replace(stack, "-", " ")), " ", "")}"
            Effect    = "Allow"
            Principal = "*"
            Action    = ["s3:PutObject", "s3:DeleteObject"]
            Resource  = "${local.bucket_arn}/stacks/${stack}/*"
            Condition = {
              StringEquals = { "aws:PrincipalOrgID" = var.organization_id }
              ArnLike      = { "aws:PrincipalArn" = arns.apply }
            }
          },
        ]
      ])
    )
  }

  key_policy = {
    Version   = "2012-10-17"
    Statement = concat(
      [
        {
          # Required: without it the key becomes unmanageable. IAM policies
          # in the management account decide who actually administers it.
          Sid       = "AccountAdministers"
          Effect    = "Allow"
          Principal = { AWS = "arn:${local.partition}:iam::${local.account_id}:root" }
          Action    = "kms:*"
          Resource  = "*"
        },
      ],
      var.organization_id == null ? [] : [
        {
          Sid       = "OrgStateRolesUseKeyThroughS3"
          Effect    = "Allow"
          Principal = { AWS = "*" }
          Action    = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
          Resource  = "*"
          Condition = {
            StringEquals = {
              "aws:PrincipalOrgID" = var.organization_id
              "kms:ViaService"     = "s3.${var.region}.amazonaws.com"
            }
            ArnLike = {
              "aws:PrincipalArn" = flatten([for arns in values(local.state_role_arns) : [arns.plan, arns.apply]])
            }
          }
        },
      ]
    )
  }
}

resource "aws_kms_key" "state" {
  description             = "Encrypts OpenTofu state for platform/aws stacks"
  enable_key_rotation     = true
  rotation_period_in_days = 365
  deletion_window_in_days = 30
  policy                  = jsonencode(local.key_policy)
}

resource "aws_kms_alias" "state" {
  name          = "alias/${var.name_prefix}-tfstate"
  target_key_id = aws_kms_key.state.key_id
}

resource "aws_s3_bucket" "state" {
  # checkov:skip=CKV_AWS_18:Access is logged by the organization CloudTrail's S3 data events (platform/aws/baseline), not a second log bucket.
  # checkov:skip=CKV2_AWS_62:No consumer for object events; changes are audited through CloudTrail.
  # checkov:skip=CKV_AWS_144:State is small, versioned and object-locked; a second-region replica doubles cost for a rebuildable artefact. Revisit if us-east-1 S3 is ever lost.
  bucket              = local.bucket_name
  object_lock_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.object_lock_days
    }
  }
  depends_on = [aws_s3_bucket_versioning.state]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = max(var.noncurrent_version_days, var.object_lock_days + 1)
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    # Each lock-file delete leaves a delete marker; clear the empty ones.
    id     = "clean-expired-delete-markers"
    status = "Enabled"
    filter {
      prefix = "stacks/"
    }
    expiration {
      expired_object_delete_marker = true
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode(local.bucket_policy)

  # Block Public Access first, so the policy can never be live without it.
  depends_on = [aws_s3_bucket_public_access_block.state]
}
