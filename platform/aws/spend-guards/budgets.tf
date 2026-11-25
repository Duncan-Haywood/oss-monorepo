# One budget per member account, all in the payer account, filtered by
# LinkedAccount. Names are `spend-<account>-monthly`: the kill switch reads
# the account back out of the name.
module "account_budget" {
  source   = "../modules/budget"
  for_each = local.accounts

  name              = "spend-${each.key}-monthly"
  limit_usd         = each.value.monthly_limit_usd
  linked_account_id = each.value.id
  alert_thresholds  = var.alert_thresholds
  hard_line_percent = var.hard_line_percent
  alert_emails      = var.alert_emails

  kill_switch_topic_arn = each.value.kill_switch ? aws_sns_topic.kill_switch.arn : null

  hard_action               = each.value.hard_action
  action_execution_role_arn = each.value.hard_action == "scp" ? aws_iam_role.budget_actions.arn : null
  deny_scp_id               = each.value.hard_action == "scp" ? aws_organizations_policy.deny_new_spend.id : null

  depends_on = [terraform_data.account_ids_known, aws_iam_role_policy.budget_actions, aws_sns_topic_policy.kill_switch]
}

# The whole consolidated bill, management account included. Alerts only: an
# organization-wide deny would also stop logging and security tooling.
module "org_budget" {
  source = "../modules/budget"

  name              = "spend-org-monthly"
  limit_usd         = var.org_monthly_limit_usd
  alert_thresholds  = var.alert_thresholds
  hard_line_percent = var.hard_line_percent
  alert_emails      = var.alert_emails
}
