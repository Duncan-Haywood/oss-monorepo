variable "region" {
  type    = string
  default = "us-east-1"
  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "region must be us-east-1 or us-west-2."
  }
}

variable "deploy_role_arn" {
  description = "Deploy role in the payments account. NOT reachable from this public repository's Actions: apply from the private repository's CI or by the owner."
  type        = string
}

variable "allowed_account_ids" {
  description = "[payments account id]. Empty = no guard (tests)."
  type        = list(string)
  default     = null
}

variable "build_dir" {
  type    = string
  default = null
}

variable "queue_url" {
  description = "saas-starter output entitlement_queue_url"
  type        = string
}

variable "queue_arn" {
  description = "saas-starter output entitlement_queue_arn"
  type        = string
}

variable "queue_kms_key_arn" {
  description = "saas-starter output entitlement_queue_kms_key_arn"
  type        = string
}

variable "alarm_topic_arn" {
  type    = string
  default = null
}
