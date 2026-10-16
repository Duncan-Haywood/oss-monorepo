variable "name" {
  description = "Prefix for created resources (the deploy repository's name)."
  type        = string
}

variable "app_dir" {
  description = "Directory holding the static site to upload."
  type        = string
  default     = "../app"
}

variable "budget_email" {
  description = "Email for monthly budget alerts (80% actual, 100% forecast). Empty: no budget is created."
  type        = string
  default     = ""
}

variable "budget_amount" {
  description = "Monthly budget for the whole AWS account, in USD."
  type        = number
  default     = 10
}
