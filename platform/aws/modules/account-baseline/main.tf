# The settings every account gets, in each allowed region: account-level S3
# Block Public Access, default EBS encryption under the account's own KMS
# key, and an AWS Config recorder delivering to the log archive.
# GuardDuty and Security Hub are not here: the security account auto-enables
# them for every account (platform/aws/baseline). Client accounts vended by
# client-accounts reuse this module unchanged.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region

  account_key_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministers"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        # EBS (and the Auto Scaling service-linked role, for launched
        # instances) use the key through EC2 on behalf of this account only.
        Sid       = "EbsUsesKeyForThisAccount"
        Effect    = "Allow"
        Principal = { AWS = "*" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey", "kms:CreateGrant"]
        Resource  = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = local.account_id
            "kms:ViaService"    = "ec2.${local.region}.amazonaws.com"
          }
        }
      },
    ]
  }
}

resource "aws_kms_key" "account" {
  description             = "Default key for ${var.account_name} in ${local.region} (EBS and anything without its own key)"
  enable_key_rotation     = true
  rotation_period_in_days = 365
  deletion_window_in_days = 30
  policy                  = jsonencode(local.account_key_policy)
}

resource "aws_kms_alias" "account" {
  name          = "alias/account-default"
  target_key_id = aws_kms_key.account.key_id
}

resource "aws_ebs_encryption_by_default" "this" {
  enabled = true
}

resource "aws_ebs_default_kms_key" "this" {
  key_arn = aws_kms_key.account.arn
}

# Account-wide, so only in the home region instance.
resource "aws_s3_account_public_access_block" "this" {
  count                   = var.manage_global_resources ? 1 : 0
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_service_linked_role" "config" {
  count            = var.manage_global_resources && var.create_config_service_linked_role ? 1 : 0
  aws_service_name = "config.amazonaws.com"
}

resource "aws_config_configuration_recorder" "this" {
  name     = "default"
  role_arn = "arn:aws:iam::${local.account_id}:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig"

  recording_group {
    all_supported = true
    # IAM and other global resources once, from the home region.
    include_global_resource_types = var.manage_global_resources
  }

  depends_on = [aws_iam_service_linked_role.config]
}

resource "aws_config_delivery_channel" "this" {
  name           = "default"
  s3_bucket_name = var.config_bucket_name
  s3_key_prefix  = "config"
  s3_kms_key_arn = var.config_kms_key_arn

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }

  depends_on = [aws_config_configuration_recorder.this]
}

resource "aws_config_configuration_recorder_status" "this" {
  name       = aws_config_configuration_recorder.this.name
  is_enabled = true
  depends_on = [aws_config_delivery_channel.this]
}
