output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "kill_topic_arn" {
  value = aws_sns_topic.kill.arn
}

output "kill_switch_function" {
  value = aws_lambda_function.kill_switch.function_name
}

output "freeze_policy_id" {
  description = "The freeze: the SCP id, or in single-account mode the IAM policy ARN (detach it from the roles to resume)."
  value       = local.single ? aws_iam_policy.freeze[0].arn : aws_organizations_policy.freeze[0].id
}
