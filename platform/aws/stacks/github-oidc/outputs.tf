output "role_arns" {
  description = "Plan and apply role ARNs keyed by stack: { <stack> = { plan, apply } }."
  value = merge(
    module.security.role_arns,
    module.shared_infra.role_arns,
    module.apps.role_arns,
    module.payments.role_arns,
  )
}

output "state_buckets" {
  description = "State bucket per workload account; a workload stack's backend uses its account's bucket with key <stack>/terraform.tfstate."
  value = {
    security     = module.security.state_bucket
    shared-infra = module.shared_infra.state_bucket
    apps         = module.apps.state_bucket
    payments     = module.payments.state_bucket
  }
}

output "findings_read_role_arn" {
  description = "Role the findings-to-files job assumes."
  value       = module.security.extra_role_arns["gha-oss-monorepo-findings-read"]
}
