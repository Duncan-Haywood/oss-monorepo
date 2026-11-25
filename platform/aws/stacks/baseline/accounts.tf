# The per-account baseline in every account (modules/account-baseline).
# Global resources (IAM) are recorded by Config only in the home region, and
# the region-deny SCP keeps workloads to var.region, so one region suffices.

locals {
  baseline_common = {
    log_bucket_name       = aws_s3_bucket.logs.id
    log_kms_key_arn       = aws_kms_key.logs.arn
    management_account_id = local.mgmt_id
  }
}

module "management" {
  source                = "../../modules/account-baseline"
  account_key           = "management"
  is_management         = true
  log_bucket_name       = local.baseline_common.log_bucket_name
  log_kms_key_arn       = local.baseline_common.log_kms_key_arn
  management_account_id = local.baseline_common.management_account_id
  depends_on            = [aws_s3_bucket_policy.logs]
}

module "log_archive" {
  source                = "../../modules/account-baseline"
  providers             = { aws = aws.log_archive }
  account_key           = "log-archive"
  log_bucket_name       = local.baseline_common.log_bucket_name
  log_kms_key_arn       = local.baseline_common.log_kms_key_arn
  management_account_id = local.baseline_common.management_account_id
  depends_on            = [aws_s3_bucket_policy.logs]
}

module "security" {
  source                = "../../modules/account-baseline"
  providers             = { aws = aws.security }
  account_key           = "security"
  log_bucket_name       = local.baseline_common.log_bucket_name
  log_kms_key_arn       = local.baseline_common.log_kms_key_arn
  management_account_id = local.baseline_common.management_account_id
  depends_on            = [aws_s3_bucket_policy.logs]
}

module "shared_infra" {
  source                = "../../modules/account-baseline"
  providers             = { aws = aws.shared_infra }
  account_key           = "shared-infra"
  log_bucket_name       = local.baseline_common.log_bucket_name
  log_kms_key_arn       = local.baseline_common.log_kms_key_arn
  management_account_id = local.baseline_common.management_account_id
  depends_on            = [aws_s3_bucket_policy.logs]
}

module "apps" {
  source                = "../../modules/account-baseline"
  providers             = { aws = aws.apps }
  account_key           = "apps"
  log_bucket_name       = local.baseline_common.log_bucket_name
  log_kms_key_arn       = local.baseline_common.log_kms_key_arn
  management_account_id = local.baseline_common.management_account_id
  depends_on            = [aws_s3_bucket_policy.logs]
}

module "payments" {
  source                = "../../modules/account-baseline"
  providers             = { aws = aws.payments }
  account_key           = "payments"
  log_bucket_name       = local.baseline_common.log_bucket_name
  log_kms_key_arn       = local.baseline_common.log_kms_key_arn
  management_account_id = local.baseline_common.management_account_id
  depends_on            = [aws_s3_bucket_policy.logs]
}

module "sandbox" {
  source                = "../../modules/account-baseline"
  providers             = { aws = aws.sandbox }
  account_key           = "sandbox"
  log_bucket_name       = local.baseline_common.log_bucket_name
  log_kms_key_arn       = local.baseline_common.log_kms_key_arn
  management_account_id = local.baseline_common.management_account_id
  depends_on            = [aws_s3_bucket_policy.logs]
}
