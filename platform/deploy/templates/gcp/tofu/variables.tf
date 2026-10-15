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
