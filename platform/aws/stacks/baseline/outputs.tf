output "log_bucket" {
  value = aws_s3_bucket.logs.id
}

output "config_bucket" {
  value = aws_s3_bucket.config.id
}

output "log_kms_key_arn" {
  value = aws_kms_key.logs.arn
}

output "kill_switch_role_arns" {
  description = "Role in each account that the spend kill switch assumes."
  value = local.single ? { management = module.management.kill_switch_role_arn } : {
    management   = module.management.kill_switch_role_arn
    log-archive  = module.log_archive[0].kill_switch_role_arn
    security     = module.security[0].kill_switch_role_arn
    shared-infra = module.shared_infra[0].kill_switch_role_arn
    apps         = module.apps[0].kill_switch_role_arn
    payments     = module.payments[0].kill_switch_role_arn
    sandbox      = module.sandbox[0].kill_switch_role_arn
  }
}
