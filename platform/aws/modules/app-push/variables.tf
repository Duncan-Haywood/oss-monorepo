variable "name" {
  type = string
}

variable "apns_secret_name" {
  description = "Secrets Manager name of the APNs token-auth JSON. null = no iOS push."
  type        = string
  default     = null
}

variable "apns_sandbox" {
  description = "true for development builds (APNS_SANDBOX)."
  type        = bool
  default     = false
}

variable "fcm_secret_name" {
  description = "Secrets Manager name of the FCM service-account JSON. null = no Android push."
  type        = string
  default     = null
}
