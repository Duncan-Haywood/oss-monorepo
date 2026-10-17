variable "name" {
  description = "Prefix for created resources (the deploy repository's name)."
  type        = string
}

variable "project" {
  description = "Google Cloud project id that will own the bucket."
  type        = string
}

variable "location" {
  description = "Bucket location, e.g. US, EU or us-central1."
  type        = string
  default     = "US"
}

variable "app_dir" {
  description = "Directory holding the static site to upload."
  type        = string
  default     = "../app"
}

variable "billing_account" {
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX) for a monthly budget on this project. Empty: no budget is created."
  type        = string
  default     = ""
}

variable "budget_amount" {
  description = "Monthly budget for this project, in the billing account's currency."
  type        = number
  default     = 10
}
