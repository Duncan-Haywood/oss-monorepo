output "dns_records" {
  description = "Records to publish for SES (type, name, content, priority, ttl, purpose). Not secret."
  value       = local.dns_records
}

output "identities" {
  value = { for k, i in aws_sesv2_email_identity.this : k => { arn = i.arn, domain = i.email_identity, verified = i.verified_for_sending_status } }
}

output "configuration_sets" {
  value = { for k, c in aws_sesv2_configuration_set.this : k => c.configuration_set_name }
}

output "events_queue_url" {
  description = "The app polls this queue (BOUNCE, COMPLAINT, REJECT, RENDERING_FAILURE, DELIVERY_DELAY) into its suppression table."
  value       = aws_sqs_queue.events.id
}

output "events_queue_arn" {
  value = aws_sqs_queue.events.arn
}

output "events_kms_key_arn" {
  value = aws_kms_key.events.arn
}
