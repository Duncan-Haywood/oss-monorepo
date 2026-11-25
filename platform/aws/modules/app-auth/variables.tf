variable "name" {
  type = string
}

variable "domain_prefix" {
  description = "Hosted sign-in at https://<prefix>.auth.<region>.amazoncognito.com (globally unique)."
  type        = string
}

variable "tier" {
  description = "LITE (cheapest; free to 10k MAU) or ESSENTIALS (managed login, passwordless)."
  type        = string
  default     = "LITE"
  validation {
    condition     = contains(["LITE", "ESSENTIALS", "PLUS"], var.tier)
    error_message = "tier must be LITE, ESSENTIALS or PLUS."
  }
}

variable "mfa" {
  description = "OFF, OPTIONAL (users may add TOTP) or ON."
  type        = string
  default     = "OPTIONAL"
}

variable "self_sign_up" {
  type    = bool
  default = true
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "web_callback_urls" {
  type = list(string)
  validation {
    condition     = length(var.web_callback_urls) > 0 && alltrue([for u in var.web_callback_urls : startswith(u, "https://") || startswith(u, "http://localhost")])
    error_message = "web callbacks must be https:// (http://localhost allowed for development)."
  }
}

variable "web_logout_urls" {
  type    = list(string)
  default = []
}

variable "native_callback_urls" {
  description = "e.g. [\"myapp://auth/callback\"]. Empty = no native client."
  type        = list(string)
  default     = []
}

variable "native_logout_urls" {
  type    = list(string)
  default = []
}

variable "ses_identity_arn" {
  description = "Verified SES identity (from the SES stack) for sign-up mail. null = Cognito's built-in sender (50 emails/day)."
  type        = string
  default     = null
}

variable "from_email" {
  type    = string
  default = null
}
