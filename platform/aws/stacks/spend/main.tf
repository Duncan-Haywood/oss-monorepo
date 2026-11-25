# Spend guarded in layers (docs/reports/2026-11-24-cloud-provider-comparison.md
# §7, principle 4). What stops and what keeps running: README.md here.
#
#  1. A monthly cost budget per account, alerting at 80% actual and 100%
#     forecast (alerts topic).
#  2. At var.freeze_at_percent actual, an AWS Budgets action attaches the
#     spend-freeze SCP to that account: nothing new can start.
#  3. At the same point the budget notifies the kill topic, and the kill
#     switch Lambda stops what is already running in that account.
#
# AWS offers no hard spending cap resource in provider 6.72.0 (its schema has
# no spend-limit resource), and Budgets data lags by hours, so overshoot is
# possible: the limits are set below what the owner can afford to lose.

locals {
  org      = data.terraform_remote_state.org.outputs
  mgmt_id  = local.org.management_account_id
  accounts = merge({ management = local.mgmt_id }, local.org.account_ids)
  # Accounts the freeze SCP can be attached to (SCPs never bind the
  # management account).
  freezable = { for k, id in local.org.account_ids : k => id }
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
}

resource "aws_sns_topic_policy" "this" {
  for_each = { alerts = aws_sns_topic.alerts.arn, kill = aws_sns_topic.kill.arn }
  arn      = each.value
  policy   = data.aws_iam_policy_document.topic_publish[each.key].json
}

resource "aws_sns_topic_subscription" "alert_email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_budgets_budget" "account" {
  for_each     = local.accounts
  name         = "monthly-${each.key}"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_limits_usd[each.key])
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "LinkedAccount"
    values = [each.value]
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
    comparison_operator       = "GREATER_THAN"
    threshold                 = var.freeze_at_percent
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.kill.arn, aws_sns_topic.alerts.arn]
  }

  depends_on = [aws_sns_topic_policy.this]
}

resource "aws_budgets_budget" "organization" {
  name         = "monthly-organization"
  budget_type  = "COST"
  limit_amount = tostring(var.organization_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

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
