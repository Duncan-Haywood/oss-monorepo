# Cost Anomaly Detection: catches a spike (a runaway loop, a leaked key) days
# before a monthly budget would, because it compares each day with the usual.
resource "aws_ce_anomaly_monitor" "services" {
  count             = var.create_service_monitor ? 1 : 0
  name              = "${local.name}-by-service"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_monitor" "accounts" {
  count        = length(local.accounts) == 0 ? 0 : 1
  name         = "${local.name}-by-account"
  monitor_type = "CUSTOM"
  monitor_specification = jsonencode({
    And            = null
    CostCategories = null
    Dimensions = {
      Key          = "LINKED_ACCOUNT"
      MatchOptions = null
      Values       = sort([for a in values(local.accounts) : a.id])
    }
    Not  = null
    Or   = null
    Tags = null
  })
}

resource "aws_ce_anomaly_subscription" "email" {
  count     = var.create_service_monitor || length(local.accounts) > 0 ? 1 : 0
  name      = "${local.name}-daily"
  frequency = "DAILY"
  monitor_arn_list = concat(
    aws_ce_anomaly_monitor.services[*].arn,
    aws_ce_anomaly_monitor.accounts[*].arn,
  )

  dynamic "subscriber" {
    for_each = toset(var.alert_emails)
    content {
      type    = "EMAIL"
      address = subscriber.value
    }
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.anomaly_threshold_usd)]
    }
  }
}
