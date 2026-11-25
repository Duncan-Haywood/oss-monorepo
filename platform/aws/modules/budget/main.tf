# One monthly cost budget with layered notifications and an optional
# automatic deny action at the hard line. See README.md.

locals {
  # The hard line always emails, so it joins the alert set; duplicates collapse.
  actual_thresholds = sort(distinct(concat([for t in var.alert_thresholds : tostring(t)], [tostring(var.hard_line_percent)])))
  hard_line         = tostring(var.hard_line_percent)

  notification_count = length(local.actual_thresholds) + (var.forecast_threshold == null ? 0 : 1)
}

resource "aws_budgets_budget" "this" {
  name         = var.name
  budget_type  = "COST"
  limit_amount = format("%.2f", var.limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "cost_filter" {
    for_each = var.linked_account_id == null ? [] : [var.linked_account_id]
    content {
      name   = "LinkedAccount"
      values = [cost_filter.value]
    }
  }

  dynamic "notification" {
    for_each = toset(local.actual_thresholds)
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = tonumber(notification.value)
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alert_emails
      # Only the hard line wakes the kill switch.
      subscriber_sns_topic_arns = notification.value == local.hard_line && var.kill_switch_topic_arn != null ? [var.kill_switch_topic_arn] : null
    }
  }

  dynamic "notification" {
    for_each = var.forecast_threshold == null ? [] : [var.forecast_threshold]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = var.alert_emails
    }
  }

  lifecycle {
    precondition {
      # AWS Budgets allows five notifications per budget.
      condition     = local.notification_count <= 5
      error_message = "At most 5 notifications per budget: trim alert_thresholds or drop the forecast alert."
    }
    precondition {
      condition     = var.hard_action == "none" || var.action_execution_role_arn != null
      error_message = "hard_action needs action_execution_role_arn."
    }
    precondition {
      condition     = var.hard_action != "scp" || (var.deny_scp_id != null && var.linked_account_id != null)
      error_message = "hard_action = scp needs deny_scp_id and linked_account_id (the account the SCP is attached to)."
    }
    precondition {
      condition     = var.hard_action != "iam" || (var.deny_iam_policy_arn != null && length(var.deny_iam_roles) > 0)
      error_message = "hard_action = iam needs deny_iam_policy_arn and at least one role in deny_iam_roles."
    }
  }
}

resource "aws_budgets_budget_action" "scp" {
  count = var.hard_action == "scp" ? 1 : 0

  budget_name        = aws_budgets_budget.this.name
  action_type        = "APPLY_SCP_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = var.action_execution_role_arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = var.hard_line_percent
  }

  definition {
    scp_action_definition {
      policy_id  = var.deny_scp_id
      target_ids = [var.linked_account_id]
    }
  }

  dynamic "subscriber" {
    for_each = toset(var.alert_emails)
    content {
      address           = subscriber.value
      subscription_type = "EMAIL"
    }
  }
}

resource "aws_budgets_budget_action" "iam" {
  count = var.hard_action == "iam" ? 1 : 0

  budget_name        = aws_budgets_budget.this.name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = var.action_execution_role_arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = var.hard_line_percent
  }

  definition {
    iam_action_definition {
      policy_arn = var.deny_iam_policy_arn
      roles      = var.deny_iam_roles
    }
  }

  dynamic "subscriber" {
    for_each = toset(var.alert_emails)
    content {
      address           = subscriber.value
      subscription_type = "EMAIL"
    }
  }
}
