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
  value = aws_organizations_policy.freeze.id
}
