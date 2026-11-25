output "webhook_url" {
  description = "Paste into Paddle > Developer tools > Notifications as the destination URL."
  value       = aws_lambda_function_url.this.function_url
}

output "role_arn" {
  value = aws_iam_role.this.arn
}

output "secret_name" {
  value = aws_secretsmanager_secret.paddle.name
}

output "policy" {
  value = local.policy
}
