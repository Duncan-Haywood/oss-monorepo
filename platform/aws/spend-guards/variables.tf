variable "deploy_role_arn" {
  description = "Role in the management account that CI (gha-oss-monorepo-spend-guards-apply / -plan) assumes."
  type        = string
}

variable "expected_account_id" {
  description = "Optional guard: the management account id. When set, the provider refuses to run anywhere else."
  type        = string
  default     = null
}

variable "region" {
  description = "Home region. Budgets, Cost Explorer and anomaly detection are global but served from us-east-1."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "Only us-east-1 and us-west-2 are allowed."
  }
}

variable "accounts" {
  description = <<-EOT
    One entry per member account, keyed by the shared account names
    (apps, payments, sandbox, shared-infra, security, log-archive, or a client account).
      id                12-digit account id; may be left null when org_state supplies it
      monthly_limit_usd the budget; alerts at alert_thresholds, the hard line at hard_line_percent
      hard_action       "scp": attach the deny-new-spend SCP at the hard line; "none": alerts only
      kill_switch       true: the kill-switch Lambda stops this account's resources at the hard line
  EOT
  type = map(object({
    id                = optional(string)
    monthly_limit_usd = number
    hard_action       = optional(string, "scp")
    kill_switch       = optional(bool, true)
  }))

  validation {
    condition     = alltrue([for k, a in var.accounts : can(regex("^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$", k))])
    error_message = "Account keys must be lowercase letters, digits and hyphens (they become budget names)."
  }
  validation {
    condition     = alltrue([for a in values(var.accounts) : a.id == null || can(regex("^[0-9]{12}$", coalesce(a.id, "x")))])
    error_message = "Account ids must be 12 digits."
  }
  validation {
    condition     = alltrue([for a in values(var.accounts) : contains(["scp", "none"], a.hard_action)])
    error_message = "hard_action must be scp or none (iam needs a budget inside the member account; see modules/budget)."
  }
  validation {
    condition     = alltrue([for a in values(var.accounts) : a.monthly_limit_usd > 0])
    error_message = "monthly_limit_usd must be positive."
  }
  validation {
    # SCPs never apply to the management account, so a deny there would be a
    # guard that only looks like one.
    condition     = !contains(keys(var.accounts), "management")
    error_message = "Leave management out of accounts: org_monthly_limit_usd covers the whole bill, and SCPs do not apply to it."
  }
}

variable "org_state" {
  description = "Optional S3 location of the organization stack's state. Its `account_ids` output (map of account name to id) fills any null id in accounts."
  type = object({
    bucket = string
    key    = string
    region = optional(string, "us-east-1")
  })
  default = null
}

variable "org_monthly_limit_usd" {
  description = "A budget over the whole consolidated bill (alerts only)."
  type        = number
  default     = 100
}

variable "alert_emails" {
  description = "Who is emailed. Set from the CI environment variable, never committed (it is personal data)."
  type        = list(string)
  sensitive   = false

  validation {
    condition     = length(var.alert_emails) > 0 && length(var.alert_emails) <= 10
    error_message = "Between 1 and 10 addresses."
  }
}

variable "alert_thresholds" {
  description = "Percentages of each budget at which actual spend emails."
  type        = list(number)
  default     = [50, 80, 100]
}

variable "hard_line_percent" {
  description = "Percentage of each account budget where the SCP and the kill switch fire."
  type        = number
  default     = 100
}

variable "anomaly_threshold_usd" {
  description = "Cost Anomaly Detection emails when an anomaly's total impact reaches this many dollars."
  type        = number
  default     = 10
}

variable "create_service_monitor" {
  description = "Create the per-service anomaly monitor. AWS allows one per account and may have made a default one at sign-up: import it instead (README)."
  type        = bool
  default     = true
}

variable "kill_switch_mode" {
  description = "enforce: stop resources. dry_run: only log what would stop. Start in dry_run for the first month if you want to watch it."
  type        = string
  default     = "enforce"

  validation {
    condition     = contains(["enforce", "dry_run"], var.kill_switch_mode)
    error_message = "kill_switch_mode must be enforce or dry_run."
  }
}

variable "kill_switch_regions" {
  description = "Regions the kill switch sweeps (the allowed regions)."
  type        = list(string)
  default     = ["us-east-1", "us-west-2"]
}

variable "kill_switch_role_name" {
  description = "Role the member stack creates in each account and the Lambda assumes."
  type        = string
  default     = "spend-kill-switch"
}

variable "log_retention_days" {
  description = "Retention of the kill switch's own logs."
  type        = number
  default     = 365
}
