output "organization_id" {
  value = aws_organizations_organization.this.id
}

output "management_account_id" {
  value = aws_organizations_organization.this.master_account_id
}

output "account_ids" {
  description = "Member account IDs by key; read by the other stacks through terraform_remote_state."
  value       = { for k, a in aws_organizations_account.this : k => a.id }
}

output "ou_ids" {
  value = { for k, ou in aws_organizations_organizational_unit.this : k => ou.id }
}

output "region" {
  value = var.region
}
