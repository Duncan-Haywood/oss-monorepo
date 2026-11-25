output "budget_name" {
  description = "Name of the budget (also what the kill-switch Lambda parses)."
  value       = aws_budgets_budget.this.name
}

output "budget_arn" {
  description = "ARN of the budget."
  value       = aws_budgets_budget.this.arn
}

output "action_ids" {
  description = "Ids of the hard-line budget actions (empty when hard_action is none). Resetting one is how spend resumes."
  value       = concat(aws_budgets_budget_action.scp[*].action_id, aws_budgets_budget_action.iam[*].action_id)
}
