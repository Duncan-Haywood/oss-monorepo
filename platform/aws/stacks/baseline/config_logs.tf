# AWS Config's delivery bucket, in the log-archive account beside the trail
# bucket. AWS Config does not support delivery to a bucket with Object Lock
# default retention (AWS Config guide, "Working with the delivery channel"),
# so PutDeliveryChannel to the trail bucket failed with
# InsufficientDeliveryPolicyException in every account (apply runs
# 45929949287 and 45935547543). The trail bucket keeps its lock; this one is
# versioned, encrypted with the same key, private and kept as long.

locals {
  config_bucket = "${local.accounts["log-archive"]}-org-config-${var.region}"
}

resource "aws_s3_bucket" "config" {
  #checkov:skip=CKV_AWS_18:server access logs need a further bucket; CloudTrail records management calls on this one
  #checkov:skip=CKV2_AWS_62:nothing consumes object notifications yet
  #checkov:skip=CKV_AWS_144:the region-deny SCP keeps the organisation to one region; replication is a later decision
  provider = aws.log_archive
  bucket   = local.config_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "config" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.config.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.config.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.logs.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "config" {
  provider                = aws.log_archive
  bucket                  = aws_s3_bucket.config.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "config" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.config.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "config" {
  provider = aws.log_archive
  bucket   = aws_s3_bucket.config.id

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

data "aws_iam_policy_document" "config_bucket" {
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.config.arn, "${aws_s3_bucket.config.arn}/*"]
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
    sid       = "ConfigAclCheck"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.config.arn]
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

  statement {
    sid       = "ConfigWrite"
    actions   = ["s3:PutObject"]
    resources = [for id in local.all_ids : "${aws_s3_bucket.config.arn}/config/AWSLogs/${id}/Config/*"]
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

resource "aws_s3_bucket_policy" "config" {
  provider   = aws.log_archive
  bucket     = aws_s3_bucket.config.id
  policy     = data.aws_iam_policy_document.config_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.config]
}
