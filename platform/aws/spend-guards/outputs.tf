output "kill_switch_lambda_role_arn" {
  description = "Input to the member stack (spend-guards/member): the only principal its spend-kill-switch role trusts."
  value       = aws_iam_role.kill_switch.arn
}

output "kill_switch_function_name" {
  description = "Invoke this for a manual stop or resume (README)."
  value       = aws_lambda_function.kill_switch.function_name
}

output "kill_switch_topic_arn" {
  description = "SNS topic the hard-line notifications publish to."
  value       = aws_sns_topic.kill_switch.arn
}

output "deny_new_spend_policy_id" {
  description = "The SCP attached at the hard line."
  value       = aws_organizations_policy.deny_new_spend.id
}

output "budget_names" {
  description = "Budget per account."
  value       = { for k, m in module.account_budget : k => m.budget_name }
}

output "budget_action_ids" {
  description = "Hard-line action per account. Resetting it in Budgets detaches the SCP (README, Resume)."
  value       = { for k, m in module.account_budget : k => m.action_ids }
}
