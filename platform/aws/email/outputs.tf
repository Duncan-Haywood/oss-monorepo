output "configuration_sets" {
  description = "Configuration set per stream (SES_CONFIGURATION_SET for sender/ses-sender.mjs)."
  value       = { for k, v in aws_sesv2_configuration_set.stream : k => v.configuration_set_name }
}

output "sending_domains" {
  description = "Sending domain per stream (MAIL_FROM uses an address on it)."
  value       = { for k, v in local.streams : k => v.domain }
}

output "identity_arns" {
  description = "SES identity ARN per domain (FromEmailAddressIdentityArn for cross-account senders)."
  value       = { for k, v in aws_sesv2_email_identity.domain : k => v.arn }
}

output "consent_table_name" {
  description = "The suppression and consent table every sender checks."
  value       = aws_dynamodb_table.consent.name
}

output "consent_table_arn" {
  description = "Consent table ARN."
  value       = aws_dynamodb_table.consent.arn
}

output "pepper_secret_arn" {
  description = "Secret with the address-hashing pepper (senders read it to look up the table)."
  value       = aws_secretsmanager_secret.pepper.arn
}

output "unsubscribe_secret_arn" {
  description = "Secret with the unsubscribe-token signing key (UNSUBSCRIBE_SECRET for senders)."
  value       = aws_secretsmanager_secret.unsubscribe.arn
}

output "unsubscribe_url" {
  description = "Public one-click unsubscribe endpoint (UNSUBSCRIBE_URL). The site stack may front it at https://<site>/unsubscribe."
  value       = "${trimsuffix(aws_lambda_function_url.unsubscribe.function_url, "/")}/unsubscribe"
}

output "support_addresses" {
  description = "Addresses SES receives for (from platform/pages/cloudflare/email-routing.json)."
  value       = local.support_addresses
}

output "inbound_mx_record" {
  description = "The apex MX value that moves support mail to SES (published only when receive_mail = true)."
  value       = "10 inbound-smtp.${local.region}.amazonaws.com"
}
