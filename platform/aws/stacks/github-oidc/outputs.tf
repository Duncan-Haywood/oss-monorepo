output "role_arns" {
  description = "Plan and apply role ARNs keyed by stack: { <stack> = { plan, apply } }."
  value = merge(
    module.security.role_arns,
    module.shared_infra.role_arns,
    module.apps.role_arns,
    module.payments.role_arns,
    length(module.single) > 0 ? module.single[0].role_arns : {},
  )
}

output "state_buckets" {
  description = "State bucket per workload account; a workload stack's backend uses its account's bucket with key <stack>/terraform.tfstate."
  value = length(module.single) > 0 ? {
    # Single-account mode: one workloads bucket; payments waits for an Organization.
    security     = module.single[0].state_bucket
    shared-infra = module.single[0].state_bucket
    apps         = module.single[0].state_bucket
    payments     = null
    } : {
    security     = module.security.state_bucket
    shared-infra = module.shared_infra.state_bucket
    apps         = module.apps.state_bucket
    payments     = module.payments.state_bucket
  }
}

output "findings_read_role_arn" {
  description = "Role the findings-to-files job assumes."
  value       = length(module.single) > 0 ? module.single[0].extra_role_arns["gha-oss-monorepo-findings-read"] : module.security.extra_role_arns["gha-oss-monorepo-findings-read"]
}
