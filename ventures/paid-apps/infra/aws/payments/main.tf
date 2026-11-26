# The payments half of the AWS SaaS starter: Paddle's notification destination. Only this private
# repository applies it (the payments account's deploy role trusts only Duncan-Haywood/private-monorepo).
# Same module and wiring as oss-monorepo platform/aws/stacks/saas-starter/payments, pinned by commit.
# Paddle stays the merchant of record; this only receives, verifies and forwards its webhooks to the
# apps account's entitlement queue, where every product (grants first) reads them.
# The Paddle secret key is put once by the owner (output secret_name); it never enters this repo.

module "paddle_webhook" {
  source = "git::https://github.com/Duncan-Haywood/oss-monorepo.git//platform/aws/modules/app-paddle-webhook?ref=d59d05bb052dbe82e1bd682e7c02c6fc0a9be424"

  source_dir               = "${var.build_dir}/paddle-webhook"
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
  description = "aws secretsmanager put-secret-value --secret-id <this> --secret-string <Paddle destination secret key> (payments account, once)."
  value       = module.paddle_webhook.secret_name
}

output "webhook_role_arn" {
  description = "Must be the role name the apps account's queue policy allows (saas-starter var payments_sender_role_name)."
  value       = module.paddle_webhook.role_arn
}
