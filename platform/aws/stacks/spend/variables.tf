variable "account_mode" {
  description = "organization or single (stacks/org's variable of the same name). Single: one budget, an IAM-policy freeze instead of the SCP (README.md, \"Single-account mode\")."
  type        = string
  default     = "organization"

  validation {
    condition     = contains(["organization", "single"], var.account_mode)
    error_message = "account_mode must be organization or single."
  }
}

variable "region" {
  type    = string
  default = "us-east-2"
}

variable "state_bucket" {
  type = string
}

variable "monthly_limits_usd" {
  description = "Monthly cost budget per account, in USD. Starting dials chosen for an empty organisation, not quotes of any price: raise one in a PR when a product's real usage needs it."
  type        = map(number)
  default = {
    management   = 10
    log-archive  = 10
    security     = 30
    shared-infra = 20
    apps         = 100
    payments     = 10
    sandbox      = 20
  }
}

variable "organization_limit_usd" {
  description = "Monthly budget for the whole organisation (alerts only; the per-account budgets act). In single-account mode it is the one account's budget, which acts."
  type        = number
  default     = 200
}

variable "freeze_at_percent" {
  description = "Actual spend, as a percent of an account's budget, at which the budget action attaches the spend-freeze SCP and the kill switch runs."
  type        = number
  default     = 100
}

variable "alert_emails" {
  description = "Addresses that get budget alerts (besides the SNS topic). Empty by default; the owner's address belongs in a repository variable, not in this public file."
  type        = list(string)
  default     = []
  # Personal data: keep it out of the plan and apply logs, which are public
  # for this repository.
  sensitive = true
}

variable "kill_switch_dry_run" {
  description = "When true the kill switch logs what it would stop and changes nothing. Starts true; flip it once a dry run's log has been read."
  type        = bool
  default     = true
}

variable "kill_switch_accounts" {
  description = "Accounts whose budget, at freeze_at_percent, also runs the kill switch. The others get the freeze SCP and alerts but keep running: shared-infra holds the site and DNS, payments records Paddle webhooks, log-archive and security hold the audit trail. A direct invocation can still stop any account (README.md)."
  type        = list(string)
  default     = ["apps", "sandbox"]
}

variable "kill_switch_regions" {
  description = "Regions the kill switch sweeps: the regions the org's SCP (single-account mode: the boundary) allows, stacks/org allowed_regions."
  type        = list(string)
  default     = ["us-east-2", "us-east-1"]
}

variable "anomaly_threshold_usd" {
  description = "Cost Anomaly Detection alerts when one anomaly's total impact reaches this many dollars. A starting dial, not a quote."
  type        = number
  default     = 10
}

variable "create_service_monitor" {
  description = "Create the per-service anomaly monitor. AWS allows one per account and may have created a default at sign-up: if the apply says so, import that one instead (README.md)."
  type        = bool
  default     = true
}
