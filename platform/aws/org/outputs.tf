output "organization_id" {
  description = "o-xxxxxxxxxx; bootstrap's organization_id variable and every aws:PrincipalOrgID condition."
  value       = aws_organizations_organization.this.id
}

output "organization_root_id" {
  description = "r-xxxx; the root the SCPs attach to."
  value       = local.root_id
}

output "account_ids" {
  description = "Account IDs keyed by name: management, log-archive, security, shared-infra, apps, payments, sandbox."
  value       = local.all_account_ids
}

output "ou_ids" {
  description = "OU IDs keyed by security, infrastructure, workloads, payments, sandbox, clients (client-accounts vends into clients)."
  value       = { for k, ou in aws_organizations_organizational_unit.this : k => ou.id }
}

output "identity_center_instance_arn" {
  description = "Null until the owner enables Identity Center."
  value       = local.sso_instance_arn
}
