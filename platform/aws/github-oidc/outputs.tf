output "role_arns" {
  description = "Plan and apply role ARNs keyed by stack: { <stack> = { plan, apply } }."
  value = merge(
    module.management.role_arns,
    module.security.role_arns,
    module.shared_infra.role_arns,
    module.apps.role_arns,
    module.payments.role_arns,
  )
}

output "findings_read_role_arn" {
  description = "Role the findings-to-files job assumes."
  value       = module.security.extra_role_arns["gha-oss-monorepo-findings-read"]
}

output "oidc_provider_arns" {
  description = "GitHub OIDC provider per account."
  value = {
    management   = module.management.oidc_provider_arn
    security     = module.security.oidc_provider_arn
    shared-infra = module.shared_infra.oidc_provider_arn
    apps         = module.apps.oidc_provider_arn
    payments     = module.payments.oidc_provider_arn
  }
}
