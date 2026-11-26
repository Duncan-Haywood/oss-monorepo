# Spend guarded in layers (docs/reports/2026-11-24-cloud-provider-comparison.md
# §7, principle 4). What stops and what keeps running: README.md here.
#
#  0. Cost Anomaly Detection (anomaly.tf): the same-day signal.
#  1. A monthly cost budget per account, alerting at 50% and 80% actual and
#     100% forecast (alerts topic).
#  2. At var.freeze_at_percent actual, an AWS Budgets action attaches the
#     spend-freeze SCP to that account: nothing new can start.
#  3. At the same point, for accounts in var.kill_switch_accounts, the budget
#     notifies the kill topic and the kill switch Lambda stops what is
#     already running in that account. Other accounts only alert.
#
# AWS offers no hard spending cap resource in provider 6.72.0 (its schema has
# no spend-limit resource), and Budgets data lags by hours, so overshoot is
# possible: the limits are set below what the owner can afford to lose.

locals {
  org     = data.terraform_remote_state.org.outputs
  mgmt_id = local.org.management_account_id
  # Single-account mode: one budget for the one account (key "account",
  # limit organization_limit_usd), no Organization budget, and the freeze is
  # an IAM policy a Budgets action attaches to the account's roles
  # (freeze.tf), since there is no SCP to attach.
  single   = var.account_mode == "single"
  boundary = try(local.org.permissions_boundary_arn, null)
  accounts = local.single ? { account = local.mgmt_id } : merge({ management = local.mgmt_id }, local.org.account_ids)
  limits   = local.single ? { account = var.organization_limit_usd } : var.monthly_limits_usd
  # Accounts the freeze SCP can be attached to (SCPs never bind the
  # management account).
  freezable = local.single ? {} : { for k, id in local.org.account_ids : k => id }
  # In single-account mode the apps setting carries over: the one account
  # holds the products.
  kill_accounts = local.single ? (contains(var.kill_switch_accounts, "apps") ? ["account"] : []) : var.kill_switch_accounts
}

data "aws_iam_policy_document" "topic_key" {
  #checkov:skip=CKV_AWS_111:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_356:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_109:KMS key policies apply to their own key; Resource "*" means this key
  statement {
    sid       = "Admin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.mgmt_id}:root"]
    }
  }

  statement {
    sid       = "BudgetsPublish"
    actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
  }

  statement {
    sid       = "CostAnomalyPublish"
    actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["costalerts.amazonaws.com"]
    }
  }

  statement {
    sid       = "LogsEncrypt"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${var.region}:${local.mgmt_id}:log-group:/aws/lambda/spend-kill-switch"]
    }
  }
}

resource "aws_kms_key" "topics" {
  description         = "Budget alert and kill topics"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.topic_key.json
}

resource "aws_sns_topic" "alerts" {
  name              = "budget-alerts"
  kms_master_key_id = aws_kms_key.topics.arn
}

resource "aws_sns_topic" "kill" {
  name              = "budget-kill"
  kms_master_key_id = aws_kms_key.topics.arn
}

data "aws_iam_policy_document" "topic_publish" {
  for_each = { alerts = aws_sns_topic.alerts.arn, kill = aws_sns_topic.kill.arn }

  statement {
    sid       = "BudgetsPublish"
    actions   = ["SNS:Publish"]
    resources = [each.value]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.mgmt_id]
    }
  }

  # Cost Anomaly Detection alerts go to the alerts topic only.
  dynamic "statement" {
    for_each = each.key == "alerts" ? [each.value] : []
    content {
      sid       = "CostAnomalyPublish"
      actions   = ["SNS:Publish"]
      resources = [statement.value]
      principals {
        type        = "Service"
        identifiers = ["costalerts.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "aws:SourceAccount"
        values   = [local.mgmt_id]
      }
    }
  }
}

resource "aws_sns_topic_policy" "this" {
  for_each = { alerts = aws_sns_topic.alerts.arn, kill = aws_sns_topic.kill.arn }
  arn      = each.value
  policy   = data.aws_iam_policy_document.topic_publish[each.key].json
}

resource "aws_sns_topic_subscription" "alert_email" {
  # count, not for_each: the addresses are sensitive and must not become
  # resource keys (which plans print). How many there are is not secret.
  count     = nonsensitive(length(var.alert_emails))
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_emails[count.index]
}

resource "aws_budgets_budget" "account" {
  for_each     = local.accounts
  name         = "monthly-${each.key}"
  budget_type  = "COST"
  limit_amount = tostring(local.limits[each.key])
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # One account has nothing to filter (and is no linked account).
  dynamic "cost_filter" {
    for_each = local.single ? [] : [each.value]
    content {
      name   = "LinkedAccount"
      values = [cost_filter.value]
    }
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 50
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator = "GREATER_THAN"
    threshold           = var.freeze_at_percent
    threshold_type      = "PERCENTAGE"
    notification_type   = "ACTUAL"
    # Only kill-switch accounts wake the kill switch; the rest alert.
    subscriber_sns_topic_arns = contains(local.kill_accounts, each.key) ? [aws_sns_topic.kill.arn, aws_sns_topic.alerts.arn] : [aws_sns_topic.alerts.arn]
  }

  lifecycle {
    precondition {
      condition     = local.single || alltrue([for k in var.kill_switch_accounts : contains(keys(local.accounts), k)])
      error_message = "kill_switch_accounts names an account the org stack does not have."
    }
    precondition {
      condition     = !contains([50, 80], var.freeze_at_percent)
      error_message = "freeze_at_percent must differ from the 50% and 80% alerts (AWS rejects two notifications at one threshold)."
    }
  }

  depends_on = [aws_sns_topic_policy.this]
}

resource "aws_budgets_budget" "organization" {
  # Single-account mode: the one account's budget already has this limit.
  count        = local.single ? 0 : 1
  name         = "monthly-organization"
  budget_type  = "COST"
  limit_amount = tostring(var.organization_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 50
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  depends_on = [aws_sns_topic_policy.this]
}
