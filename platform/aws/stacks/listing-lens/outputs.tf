output "api_endpoint" {
  value = module.docs.api_endpoint
}

output "api_domain_target" {
  description = "For stacks/dns extra_alias_records once certificate_arn is set: { name, zone_id }."
  value       = module.docs.api_domain_target
}

output "auth" {
  description = "Public Cognito values; user_pool_id is what `aws cognito-idp admin-create-user` needs."
  value       = module.docs.auth
}

output "function_name" {
  value = module.docs.function_name
}

output "policy" {
  value = module.docs.policy
}

output "app_vars" {
  value = local.app_vars
}
