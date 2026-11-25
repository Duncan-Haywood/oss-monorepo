# Payments-account half of the starter: the Paddle notification destination. Paddle itself stays
# the merchant of record (checkout, subscriptions, tax); only this receiver runs here.

module "paddle_webhook" {
  source                   = "../../../modules/app-paddle-webhook"
  source_dir               = "${coalesce(var.build_dir, "${path.module}/../runtime/dist")}/paddle-webhook"
  queue_url                = var.queue_url
  queue_arn                = var.queue_arn
  queue_kms_key_arn        = var.queue_kms_key_arn
  alarm_topic_arn          = var.alarm_topic_arn
  permissions_boundary_arn = var.permissions_boundary_arn
}

output "webhook_url" {
  description = "Paste into Paddle > Developer tools > Notifications (subscription.* events)."
  value       = module.paddle_webhook.webhook_url
}

output "secret_name" {
  description = "Put the destination's secret key here once: aws secretsmanager put-secret-value --secret-id <name> --secret-string <key>"
  value       = module.paddle_webhook.secret_name
}

output "webhook_role_arn" {
  value = module.paddle_webhook.role_arn
}
