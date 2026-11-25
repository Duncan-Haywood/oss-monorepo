output "platform" {
  description = "Pass to app-service as `platform` (also readable by other stacks via terraform_remote_state)."
  value       = local.platform
}

output "entitlement_queue_url" {
  description = "payments stack var.queue_url"
  value       = module.entitlements.queue_url
}

output "entitlement_queue_arn" {
  description = "payments stack var.queue_arn"
  value       = module.entitlements.queue_arn
}

output "entitlement_queue_kms_key_arn" {
  description = "payments stack var.queue_kms_key_arn"
  value       = module.entitlements.queue_kms_key_arn
}

output "entitlement_dlq_url" {
  value = module.entitlements.dlq_url
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "example" {
  value = var.example_product.enabled ? { api = module.example[0].api_endpoint, auth = module.example[0].auth } : null
}
