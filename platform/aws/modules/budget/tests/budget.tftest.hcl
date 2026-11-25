mock_provider "aws" {}

variables {
  name              = "spend-apps-monthly"
  limit_usd         = 50
  linked_account_id = "111111111111"
  alert_emails      = ["alerts@example.invalid"]
}

run "alerts_at_50_80_100_and_forecast" {
  command = plan

  assert {
    condition     = toset([for n in aws_budgets_budget.this.notification : n.threshold if n.notification_type == "ACTUAL"]) == toset([50, 80, 100])
    error_message = "ACTUAL alerts must fire at 50, 80 and 100 percent."
  }
  assert {
    condition     = length([for n in aws_budgets_budget.this.notification : n if n.notification_type == "FORECASTED"]) == 1
    error_message = "A forecast alert must exist by default."
  }
  assert {
    condition     = one(aws_budgets_budget.this.cost_filter).name == "LinkedAccount"
    error_message = "The budget must be scoped to the linked account."
  }
  assert {
    condition     = length(aws_budgets_budget_action.scp) == 0 && length(aws_budgets_budget_action.iam) == 0
    error_message = "No deny action unless asked for."
  }
}

run "kill_switch_only_on_hard_line" {
  command = plan

  variables {
    kill_switch_topic_arn = "arn:aws:sns:us-east-1:000000000000:spend-kill-switch"
    hard_line_percent     = 100
  }

  assert {
    condition = alltrue([
      for n in aws_budgets_budget.this.notification :
      length(coalesce(n.subscriber_sns_topic_arns, [])) == (n.notification_type == "ACTUAL" && n.threshold == 100 ? 1 : 0)
    ])
    error_message = "Only the ACTUAL hard-line notification may publish to the kill-switch topic."
  }
}

run "scp_deny_at_hard_line" {
  command = plan

  variables {
    hard_action               = "scp"
    action_execution_role_arn = "arn:aws:iam::000000000000:role/spend-guards-budget-actions"
    deny_scp_id               = "p-abcdefgh"
    hard_line_percent         = 120
  }

  assert {
    condition     = aws_budgets_budget_action.scp[0].approval_model == "AUTOMATIC"
    error_message = "The hard-line action must apply without waiting for approval."
  }
  assert {
    condition     = one(aws_budgets_budget_action.scp[0].action_threshold).action_threshold_value == 120
    error_message = "The action must fire at the hard line."
  }
  assert {
    condition     = one(one(aws_budgets_budget_action.scp[0].definition).scp_action_definition).target_ids == toset(["111111111111"])
    error_message = "The SCP must target only the linked account."
  }
  assert {
    condition     = contains([for n in aws_budgets_budget.this.notification : n.threshold], 120)
    error_message = "The hard line must also email."
  }
}

run "iam_deny_variant" {
  command = plan

  variables {
    linked_account_id         = null
    hard_action               = "iam"
    action_execution_role_arn = "arn:aws:iam::000000000000:role/budget-actions"
    deny_iam_policy_arn       = "arn:aws:iam::000000000000:policy/spend-deny"
    deny_iam_roles            = ["app-deployer"]
  }

  assert {
    condition     = aws_budgets_budget_action.iam[0].action_type == "APPLY_IAM_POLICY"
    error_message = "iam hard_action must attach an IAM policy."
  }
}

run "scp_without_policy_is_refused" {
  command = plan

  variables {
    hard_action               = "scp"
    action_execution_role_arn = "arn:aws:iam::000000000000:role/x"
  }

  expect_failures = [aws_budgets_budget.this]
}

run "too_many_notifications_is_refused" {
  command = plan

  variables {
    alert_thresholds = [10, 20, 30, 40, 50]
  }

  expect_failures = [aws_budgets_budget.this]
}

run "bad_hard_action_is_refused" {
  command = plan

  variables {
    hard_action = "delete-everything"
  }

  expect_failures = [var.hard_action]
}
