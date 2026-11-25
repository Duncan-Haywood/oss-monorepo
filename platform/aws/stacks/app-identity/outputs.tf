output "secret_arn" {
  value = aws_secretsmanager_secret.worker.arn
}

output "sync_role_arn" {
  value = aws_iam_role.sync.arn
}

output "user_arn" {
  value = aws_iam_user.worker.arn
}
