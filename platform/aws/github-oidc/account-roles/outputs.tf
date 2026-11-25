output "role_arns" {
  description = "Plan and apply role ARNs by stack."
  value       = { for stack in keys(var.stacks) : stack => { plan = aws_iam_role.plan[stack].arn, apply = aws_iam_role.apply[stack].arn } }
}

output "extra_role_arns" {
  description = "Other role ARNs by name."
  value       = { for name, r in aws_iam_role.extra : name => r.arn }
}

output "oidc_provider_arn" {
  description = "The GitHub OIDC provider in this account."
  value       = local.provider_arn
}

output "trust_subjects" {
  description = "The one GitHub subject each role trusts, keyed by role name (for tests and review)."
  value = merge(
    { for r in aws_iam_role.plan : r.name => jsondecode(r.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] },
    { for r in aws_iam_role.apply : r.name => jsondecode(r.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] },
    { for r in aws_iam_role.extra : r.name => jsondecode(r.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] },
  )
}

output "boundary_policy" {
  description = "The permissions boundary document, or null when the account has no workload stacks."
  value       = length(aws_iam_policy.boundary) > 0 ? jsondecode(aws_iam_policy.boundary[0].policy) : null
}

output "apply_policies" {
  description = "Inline apply policy documents by stack (for tests and review)."
  value       = { for k, p in aws_iam_role_policy.apply : k => jsondecode(p.policy) }
}
