# Cost Anomaly Detection: the same-day signal. A runaway loop or a leaked key
# shows up here days before a monthly budget crosses 50%, because each day is
# compared with that service's or account's usual spend. Alerts go to the
# encrypted alerts topic (and so to alert_emails).

resource "aws_ce_anomaly_monitor" "services" {
  count             = var.create_service_monitor ? 1 : 0
  name              = "spend-by-service"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_monitor" "accounts" {
  # One account has no linked accounts to compare; the services monitor is
  # its signal.
  count        = local.single ? 0 : 1
  name         = "spend-by-account"
  monitor_type = "CUSTOM"
  monitor_specification = jsonencode({
    And            = null
    CostCategories = null
    Dimensions = {
      Key          = "LINKED_ACCOUNT"
      MatchOptions = null
      Values       = sort(values(local.accounts))
    }
    Not  = null
    Or   = null
    Tags = null
  })
}

resource "aws_ce_anomaly_subscription" "alerts" {
  name = "spend-anomalies"
  # An SNS subscriber requires IMMEDIATE.
  frequency = "IMMEDIATE"
  monitor_arn_list = concat(
    aws_ce_anomaly_monitor.services[*].arn,
    aws_ce_anomaly_monitor.accounts[*].arn,
  )

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.alerts.arn
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.anomaly_threshold_usd)]
    }
  }

  depends_on = [aws_sns_topic_policy.this]
}
