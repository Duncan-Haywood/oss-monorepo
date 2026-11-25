output "kms_key_arn" {
  description = "The account's default key in this region."
  value       = aws_kms_key.account.arn
}

output "config_recorder_name" {
  description = "Name of the Config recorder."
  value       = aws_config_configuration_recorder.this.name
}
