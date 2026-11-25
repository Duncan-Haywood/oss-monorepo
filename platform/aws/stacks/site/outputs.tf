# Names other stacks and the publish workflow read (terraform_remote_state
# key stacks/site/terraform.tfstate).

output "bucket_name" {
  value = module.site.bucket_name
}

output "distribution_id" {
  value = module.site.distribution_id
}

output "distribution_arn" {
  value = module.site.distribution_arn
}

output "distribution_domain_name" {
  description = "https://<this>/ is the address to verify before the DNS change."
  value       = module.site.distribution_domain_name
}

output "distribution_hosted_zone_id" {
  value = module.site.distribution_hosted_zone_id
}

output "certificate_validation_records" {
  value = module.site.certificate_validation_records
}

output "web_acl_arn" {
  value = module.site.web_acl_arn
}

output "publisher_role_arn" {
  value = module.site.publisher_role_arn
}
