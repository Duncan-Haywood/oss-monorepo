output "api_endpoint" {
  description = "The hub before its custom domain exists: <endpoint>/admin?key=..., /team?t=..."
  value       = module.hub.api_endpoint
}

output "api_domain_target" {
  description = "For stacks/dns extra_alias_records when custom_domain is set: { name, zone_id }."
  value       = module.hub.api_domain_target
}

output "auth" {
  description = "Cognito values for the manager sign-in page (public)."
  value       = module.hub.auth
}

output "function_name" {
  value = module.hub.function_name
}

output "role_name" {
  value = module.hub.role_name
}

output "policy" {
  description = "The app role's inline policy (for tests and review)."
  value       = module.hub.policy
}

output "app_vars" {
  description = "Non-secret config the app reads as env.VARS."
  value       = local.app_vars
}
