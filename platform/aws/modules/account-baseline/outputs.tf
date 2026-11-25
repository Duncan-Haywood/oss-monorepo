output "account_id" {
  value = data.aws_caller_identity.this.account_id
}

output "plan_role_arn" {
  value = var.is_management ? null : aws_iam_role.plan[0].arn
}

output "kill_switch_role_arn" {
  value = aws_iam_role.kill_switch.arn
}
