variable "name" {
  description = "Prefix for created resources (the deploy repository's name)."
  type        = string
}

variable "location" {
  description = "Azure region, e.g. eastus, westeurope or uksouth."
  type        = string
  default     = "eastus"
}

variable "app_dir" {
  description = "Directory holding the static site to upload."
  type        = string
  default     = "../app"
}

variable "budget_email" {
  description = "Email for monthly budget alerts on this resource group (80% actual, 100% forecast). Empty: no budget is created."
  type        = string
  default     = ""
}

variable "budget_amount" {
  description = "Monthly budget for this resource group, in the subscription's billing currency."
  type        = number
  default     = 10
}
