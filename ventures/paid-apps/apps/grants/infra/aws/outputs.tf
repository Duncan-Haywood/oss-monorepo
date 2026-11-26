output "api_endpoint" {
  description = "execute-api URL: smoke-test here while the Worker still serves production."
  value       = module.grants.api_endpoint
}

output "api_domain_target" {
  description = "For the DNS alias at cutover (null without custom_domain)."
  value       = module.grants.api_domain_target
}

output "function_name" {
  value = module.grants.function_name
}

output "bucket" {
  description = "Copy R2 objects here before cutover (docs/AWS.md)."
  value       = module.grants.bucket
}

output "app_secret_name" {
  description = "Put the app secret JSON here once (docs/AWS.md); the value never enters git."
  value       = aws_secretsmanager_secret.app.name
}

output "db" {
  value = module.grants.db
}

output "app_policy" {
  value = module.grants.policy
}
