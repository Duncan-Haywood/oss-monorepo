variable "name" {
  description = "Budget name. The kill-switch Lambda reads the account back out of names shaped `spend-<account>-monthly`."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,99}$", var.name))
    error_message = "name must be lowercase letters, digits and hyphens."
  }
}

variable "limit_usd" {
  description = "Monthly budget in US dollars. The hard line and every alert are percentages of it."
  type        = number

  validation {
    condition     = var.limit_usd > 0
    error_message = "limit_usd must be positive."
  }
}

variable "linked_account_id" {
  description = "Member account the budget watches when it is created in the management (payer) account. Null watches the whole bill of the account that owns the budget."
  type        = string
  default     = null

  validation {
    condition     = var.linked_account_id == null || can(regex("^[0-9]{12}$", var.linked_account_id))
    error_message = "linked_account_id must be a 12-digit AWS account id or null."
  }
}

variable "alert_thresholds" {
  description = "Percentages of the limit at which ACTUAL spend emails the subscribers."
  type        = list(number)
  default     = [50, 80, 100]

  validation {
    condition     = length(var.alert_thresholds) > 0 && alltrue([for t in var.alert_thresholds : t > 0 && t <= 1000])
    error_message = "alert_thresholds must be a non-empty list of percentages in (0, 1000]."
  }
}

variable "forecast_threshold" {
  description = "Percentage of the limit at which a FORECASTED overrun emails the subscribers. Null turns the forecast alert off."
  type        = number
  default     = 100
}

variable "hard_line_percent" {
  description = "Percentage of the limit where the guard stops spend: the deny action (if any) applies and the kill-switch topic (if any) is notified."
  type        = number
  default     = 100

  validation {
    condition     = var.hard_line_percent > 0 && var.hard_line_percent <= 1000
    error_message = "hard_line_percent must be in (0, 1000]."
  }
}

variable "alert_emails" {
  description = "Addresses that receive every alert. Passed in from CI configuration, never committed."
  type        = list(string)

  validation {
    condition     = length(var.alert_emails) > 0 && length(var.alert_emails) <= 10
    error_message = "Give between 1 and 10 alert addresses (an AWS Budgets limit per notification)."
  }
}

variable "kill_switch_topic_arn" {
  description = "SNS topic notified at the hard line (the kill-switch Lambda subscribes to it). Null means alerts only."
  type        = string
  default     = null
}

variable "hard_action" {
  description = <<-EOT
    What AWS Budgets does on its own at the hard line:
      "scp"  attach a service control policy to the linked account (budget must live in the management account);
      "iam"  attach an IAM deny policy to roles in the budget's own account (for a stand-alone account);
      "none" alerts and the kill switch only.
  EOT
  type        = string
  default     = "none"

  validation {
    condition     = contains(["scp", "iam", "none"], var.hard_action)
    error_message = "hard_action must be one of scp, iam, none."
  }
}

variable "action_execution_role_arn" {
  description = "Role AWS Budgets assumes to apply the hard action. Required unless hard_action is none."
  type        = string
  default     = null
}

variable "deny_scp_id" {
  description = "Id (p-...) of the deny service control policy attached at the hard line when hard_action is scp."
  type        = string
  default     = null
}

variable "deny_iam_policy_arn" {
  description = "ARN of the IAM deny policy attached at the hard line when hard_action is iam."
  type        = string
  default     = null
}

variable "deny_iam_roles" {
  description = "Role names the IAM deny policy is attached to when hard_action is iam."
  type        = list(string)
  default     = []
}
