# A monthly budget on this site's resource group, so a bill that grows (a
# traffic spike, a resource left running) emails you at 80% of actual and 100%
# of forecast spend before the invoice does. Off unless budget_email is set.
resource "azurerm_consumption_budget_resource_group" "monthly" {
  count             = var.budget_email == "" ? 0 : 1
  name              = "${var.name}-monthly"
  resource_group_id = azurerm_resource_group.site.id
  amount            = var.budget_amount
  time_grain        = "Monthly"

  # Azure wants the first of a month; the start is fixed at creation.
  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", timestamp())
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.budget_email]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Forecasted"
    contact_emails = [var.budget_email]
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}
