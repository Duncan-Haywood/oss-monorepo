# The write-once log archive (log-archive account) and the organization
# CloudTrail that fills it (created in management, as AWS requires for an
# organization trail without a delegated CloudTrail admin).

locals {
  trail_name      = "${var.name_prefix}-org-trail"
  trail_arn       = "arn:aws:cloudtrail:us-east-1:${local.management_id}:trail/${local.trail_name}"
  log_bucket_name = "${var.name_prefix}-logs-${local.log_archive_id}-us-east-1"
  log_bucket_arn  = "arn:aws:s3:::${local.log_bucket_name}"

  log_key_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministers"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.log_archive_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudTrailEncrypts"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = ["kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceArn" = local.trail_arn }
          StringLike   = { "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:aws:cloudtrail:*:${local.management_id}:trail/*" }
        }
      },
      {
        Sid       = "ConfigEncrypts"
        Effect    = "Allow"
        Principal = { Service = "config.amazonaws.com" }
        Action    = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource  = "*"
        Condition = { StringEquals = { "aws:SourceOrgID" = local.organization_id } }
      },
      {
        # Each account's Config delivery channel names this key.
        Sid       = "OrgAccountsDescribe"
        Effect    = "Allow"
        Principal = { AWS = "*" }
        Action    = "kms:DescribeKey"
        Resource  = "*"
        Condition = { StringEquals = { "aws:PrincipalOrgID" = local.organization_id } }
      },
    ]
  }

  log_bucket_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.log_bucket_arn, "${local.log_bucket_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyGovernanceBypass"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:BypassGovernanceRetention", "s3:PutObjectRetention", "s3:PutObjectLegalHold"]
        Resource  = "${local.log_bucket_arn}/*"
      },
      {
        Sid       = "CloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = local.log_bucket_arn
        Condition = { StringEquals = { "aws:SourceArn" = local.trail_arn } }
      },
      {
        Sid       = "CloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource = [
          "${local.log_bucket_arn}/cloudtrail/AWSLogs/${local.management_id}/*",
          "${local.log_bucket_arn}/cloudtrail/AWSLogs/${local.organization_id}/*",
        ]
        Condition = {
          StringEquals = {
            "aws:SourceArn" = local.trail_arn
            "s3:x-amz-acl"  = "bucket-owner-full-control"
          }
        }
      },
      {
        Sid       = "ConfigAclCheck"
        Effect    = "Allow"
        Principal = { Service = "config.amazonaws.com" }
        Action    = ["s3:GetBucketAcl", "s3:ListBucket"]
        Resource  = local.log_bucket_arn
        Condition = { StringEquals = { "aws:SourceOrgID" = local.organization_id } }
      },
      {
        Sid       = "ConfigWrite"
        Effect    = "Allow"
        Principal = { Service = "config.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${local.log_bucket_arn}/config/AWSLogs/*"
        Condition = {
          StringEquals = {
            "aws:SourceOrgID" = local.organization_id
            "s3:x-amz-acl"    = "bucket-owner-full-control"
          }
        }
      },
    ]
  }
}

resource "aws_kms_key" "logs" {
  provider                = aws.log_archive
  description             = "Encrypts the organization's CloudTrail and Config logs"
  enable_key_rotation     = true
  rotation_period_in_days = 365
  deletion_window_in_days = 30
  policy                  = jsonencode(local.log_key_policy)
}

resource "aws_kms_alias" "logs" {
  provider      = aws.log_archive
  name          = "alias/${var.name_prefix}-logs"
  target_key_id = aws_kms_key.logs.key_id
}

resource "aws_s3_bucket" "logs" {
  # checkov:skip=CKV_AWS_18:This is the log destination; logging it into itself loops, and its access is recorded by the organization trail's management events.
  # checkov:skip=CKV2_AWS_62:No consumer for object events; findings reach the queue through Security Hub.
  # checkov:skip=CKV_AWS_144:A second-region replica doubles log storage cost; object lock and versioning protect the only copy. Revisit for SOC 2.
  provider            = aws.log_archive
  bucket              = local.log_bucket_name
  object_lock_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  provider                = aws.log_archive
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "logs" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "logs" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.logs.id
  rule {
    default_retention {
      mode = var.log_object_lock_mode
      days = var.log_object_lock_days
    }
  }
  depends_on = [aws_s3_bucket_versioning.logs]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.logs.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.logs.id

  rule {
    id     = "archive-then-expire"
    status = "Enabled"
    filter {}

    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = max(var.log_retention_days, var.log_object_lock_days + 1)
    }

    noncurrent_version_expiration {
      noncurrent_days = var.log_object_lock_days + 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.logs]
}

resource "aws_s3_bucket_policy" "logs" {
  provider   = aws.log_archive
  bucket     = aws_s3_bucket.logs.id
  policy     = jsonencode(local.log_bucket_policy)
  depends_on = [aws_s3_bucket_public_access_block.logs]
}

resource "aws_cloudtrail" "org" {
  # checkov:skip=CKV2_AWS_10:No CloudWatch Logs copy: it costs per GB, and alerting runs on GuardDuty and Security Hub findings, which read the trail themselves.
  # checkov:skip=CKV_AWS_252:No SNS topic per log file; nothing consumes it.
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.logs.id
  s3_key_prefix                 = "cloudtrail"
  kms_key_id                    = aws_kms_key.logs.arn
  is_organization_trail         = true
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true

  advanced_event_selector {
    name = "All management events"
    field_selector {
      field  = "eventCategory"
      equals = ["Management"]
    }
  }

  advanced_event_selector {
    name = "Object access on the state bucket"
    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::S3::Object"]
    }
    field_selector {
      field       = "resources.ARN"
      starts_with = [for b in local.data_buckets : "${b}/"]
    }
  }

  depends_on = [aws_s3_bucket_policy.logs, aws_organizations_delegated_administrator.this]
}
