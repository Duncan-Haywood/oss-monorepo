output "log_bucket" {
  value = aws_s3_bucket.logs.id
}

output "log_kms_key_arn" {
  value = aws_kms_key.logs.arn
}

output "kill_switch_role_arns" {
  description = "Role in each account that the spend kill switch assumes."
  value = {
    management   = module.management.kill_switch_role_arn
    log-archive  = module.log_archive.kill_switch_role_arn
    security     = module.security.kill_switch_role_arn
    shared-infra = module.shared_infra.kill_switch_role_arn
    apps         = module.apps.kill_switch_role_arn
    payments     = module.payments.kill_switch_role_arn
    sandbox      = module.sandbox.kill_switch_role_arn
  }
}
