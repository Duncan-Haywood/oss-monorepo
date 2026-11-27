# Organisation CloudTrail to a write-once bucket in the log-archive account
# (docs/reports/2026-11-24-cloud-provider-comparison.md §7). AWS Config
# delivers to its own bucket (config_logs.tf): Config cannot deliver to a
# bucket with Object Lock default retention.

locals {
  log_bucket = "${local.accounts["log-archive"]}-org-logs-${var.region}"
  trail_name = "org-trail"
  trail_arn  = "arn:aws:cloudtrail:${var.region}:${local.mgmt_id}:trail/${local.trail_name}"
  all_ids    = distinct(concat([local.mgmt_id], values(local.accounts)))
}

data "aws_iam_policy_document" "log_key" {
  #checkov:skip=CKV_AWS_111:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_356:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_109:KMS key policies apply to their own key; Resource "*" means this key
  statement {
    sid       = "LogArchiveAdmin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.accounts["log-archive"]}:root"]
    }
  }

  statement {
    sid       = "CloudTrailEncrypt"
    actions   = ["kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:aws:cloudtrail:arn"
      values   = ["arn:aws:cloudtrail:*:${local.mgmt_id}:trail/*"]
    }
  }

  # With the service-linked role, Config delivers as the config.amazonaws.com
  # service principal, not as the role (AWS Config guide, "Permissions for the
  # KMS Key for the AWS Config Delivery Channel"). Naming the role here made
  # PutDeliveryChannel fail with InsufficientDeliveryPolicyException in every
  # account (apply run 45929949287). aws:SourceAccount keeps it to our accounts.
  statement {
    sid       = "ConfigEncrypt"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = local.all_ids
    }
  }
}

resource "aws_kms_key" "logs" {
  provider            = aws.log_archive
  description         = "Organisation CloudTrail and Config logs"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.log_key.json
}

resource "aws_kms_alias" "logs" {
  provider      = aws.log_archive
  name          = "alias/org-logs"
  target_key_id = aws_kms_key.logs.key_id
}

resource "aws_s3_bucket" "logs" {
  #checkov:skip=CKV_AWS_18:server access logs need a second bucket; CloudTrail already records management calls on this one (follow-up)
  #checkov:skip=CKV2_AWS_62:nothing consumes object notifications yet
  #checkov:skip=CKV_AWS_144:the region-deny SCP keeps the organisation to one region; replication is a later decision
  provider            = aws.log_archive
  bucket              = local.log_bucket
  object_lock_enabled = true

  lifecycle {
    prevent_destroy = true
  }
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
      mode = var.log_lock_mode
      days = var.log_retention_days
    }
  }
  depends_on = [aws_s3_bucket_versioning.logs]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.logs.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.logs.arn
    }
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

resource "aws_s3_bucket_ownership_controls" "logs" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
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
      days = var.log_retention_days + 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "log_bucket" {
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.logs.arn, "${aws_s3_bucket.logs.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid       = "CloudTrailAclCheck"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.logs.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid     = "CloudTrailWrite"
    actions = ["s3:PutObject"]
    resources = local.single ? ["${aws_s3_bucket.logs.arn}/cloudtrail/AWSLogs/${local.mgmt_id}/*"] : [
      "${aws_s3_bucket.logs.arn}/cloudtrail/AWSLogs/${local.mgmt_id}/*",
      "${aws_s3_bucket.logs.arn}/cloudtrail/AWSLogs/${local.org.organization_id}/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  provider   = aws.log_archive
  bucket     = aws_s3_bucket.logs.id
  policy     = data.aws_iam_policy_document.log_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.logs]
}

resource "aws_cloudtrail" "org" {
  #checkov:skip=CKV_AWS_252:GuardDuty and Security Hub alert on trail findings; per-file SNS notices would be noise
  #checkov:skip=CKV2_AWS_10:CloudWatch Logs delivery costs per GB; GuardDuty analyses CloudTrail without it (follow-up if metric filters are wanted)
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.logs.id
  s3_key_prefix                 = "cloudtrail"
  kms_key_id                    = aws_kms_key.logs.arn
  is_organization_trail         = !local.single # single-account mode: the account's own trail
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true

  depends_on = [aws_s3_bucket_policy.logs]
}
