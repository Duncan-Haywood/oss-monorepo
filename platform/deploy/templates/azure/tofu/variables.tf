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
