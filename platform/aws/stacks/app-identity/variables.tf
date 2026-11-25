variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket" {
  type = string
}

variable "member_role_name" {
  type    = string
  default = "OrganizationAccountAccessRole"
}

variable "github_repository" {
  type    = string
  default = "Duncan-Haywood/oss-monorepo"
}

variable "sync_environment" {
  description = "GitHub environment whose jobs may read the key to push it into Worker secrets. `cloudflare` already holds the Workers deploy credential and is limited to main."
  type        = string
  default     = "cloudflare"
}

variable "rotation_days" {
  description = "Days between key rotations. The previous key stays valid until the next rotation, so the daily Worker sync has this long to pick up the new one."
  type        = number
  default     = 30
}
