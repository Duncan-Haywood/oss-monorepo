variable "name" {
  description = "Prefix for created resources (the deploy repository's name)."
  type        = string
}

variable "app_dir" {
  description = "Directory holding the static site to upload."
  type        = string
  default     = "../app"
}
