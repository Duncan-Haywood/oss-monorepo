output "arn" {
  value = aws_iam_policy.this.arn
}

output "policy" {
  description = "The boundary document (tests check its statements and size)."
  value       = local.policy
}
