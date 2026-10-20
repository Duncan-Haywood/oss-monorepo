# A monthly budget on this project's spend, so a bill that grows (a traffic
# spike, a leaked key, a resource left running) emails the billing account's
# admins at 80% of actual and 100% of forecast spend before the invoice does.
# Off unless billing_account is set: creating a budget needs Billing Account
# permissions that the deploy service account may not have.
data "google_project" "this" {
  count = var.billing_account == "" ? 0 : 1
}

resource "google_billing_budget" "monthly" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "${var.name}-monthly"

  budget_filter {
    projects = ["projects/${data.google_project.this[0].number}"]
  }

  # In the billing account's own currency.
  amount {
    specified_amount {
      units = tostring(var.budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.8
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }
}
