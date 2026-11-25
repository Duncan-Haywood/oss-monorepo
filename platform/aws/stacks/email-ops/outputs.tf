output "consent_table_name" {
  description = "The suppression and consent table every sender checks (sender/consent-store.mjs)."
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
  description = "The apex MX that moves support mail to SES; publish it (Cloudflare, or Route 53 via receive_mail) only at the inbound cutover."
  value = {
    type     = "MX"
    name     = local.routing.zone
    content  = "inbound-smtp.${local.region}.amazonaws.com"
    priority = 10
  }
}
