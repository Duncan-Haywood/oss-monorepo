output "account_mode" {
  description = "organization or single; the other stacks may read it through terraform_remote_state."
  value       = var.account_mode
}

output "organization_id" {
  description = "Null in single-account mode."
  value       = local.org ? aws_organizations_organization.this[0].id : null
}

output "management_account_id" {
  value = local.org ? aws_organizations_organization.this[0].master_account_id : data.aws_caller_identity.this.account_id
}

output "account_ids" {
  description = "Member account IDs by key; read by the other stacks through terraform_remote_state. In single-account mode every key is this one account."
  value       = local.org ? { for k, a in aws_organizations_account.this : k => a.id } : { for k in keys(local.accounts) : k => data.aws_caller_identity.this.account_id }
}

output "permissions_boundary_arn" {
  description = "Single-account mode: the boundary every role a stack creates carries. Null in organization mode (the Organization's SCPs guard the accounts; workload accounts get theirs from stacks/github-oidc)."
  value       = local.org ? null : module.boundary[0].arn
}

output "ou_ids" {
  value = { for k, ou in aws_organizations_organizational_unit.this : k => ou.id }
}

output "region" {
  value = var.region
}
