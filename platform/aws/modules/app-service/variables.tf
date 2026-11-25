variable "name" {
  description = "Product id: database name, role suffix, Paddle customData.product. Lowercase, digits, underscore."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{1,40}$", var.name))
    error_message = "name must match ^[a-z][a-z0-9_]{1,40}$ (same rule as db-admin)."
  }
}

variable "source_dir" {
  description = "Built bundle: runtime/dist/app-<name> (node build.mjs product <name> <app.mjs> [migrations])."
  type        = string
}

variable "platform" {
  description = "Shared platform outputs from the saas-starter stack (output `platform`)."
  type = object({
    subnet_ids             = list(string)
    app_security_group_id  = string
    db_host                = string
    db_port                = number
    db_connect_arn_prefix  = string
    db_admin_function_name = string
    kms_key_arn            = string
  })
}

variable "auth" {
  description = "Cognito settings for this product's users."
  type = object({
    domain_prefix        = string
    web_callback_urls    = list(string)
    web_logout_urls      = optional(list(string), [])
    native_callback_urls = optional(list(string), [])
    native_logout_urls   = optional(list(string), [])
    tier                 = optional(string, "LITE")
    ses_identity_arn     = optional(string)
    from_email           = optional(string)
  })
}

variable "push" {
  description = "Mobile push credentials by Secrets Manager name; all null = no push."
  type = object({
    apns_secret_name = optional(string)
    apns_sandbox     = optional(bool, false)
    fcm_secret_name  = optional(string)
  })
  default = {}
}

variable "vars" {
  description = "Non-secret config, readable as env.VARS."
  type        = map(string)
  default     = {}
}

variable "secret_names" {
  description = "Secrets Manager names this app may read with env.secret(name) (e.g. a model API key)."
  type        = list(string)
  default     = []
}

variable "private_route_keys" {
  description = "HTTP API routes behind the Cognito JWT authorizer."
  type        = list(string)
  default     = ["ANY /api/{proxy+}"]
}

variable "cors_origins" {
  description = "Browser origins allowed to call the API cross-origin. Empty = same-origin only."
  type        = list(string)
  default     = []
}

variable "schedules" {
  description = "Workers-style cron triggers: name -> schedule expression, e.g. { daily = \"cron(0 13 * * ? *)\" }. Each calls the app's scheduled({ cron }) handler."
  type        = map(string)
  default     = {}
}

variable "memory_mb" {
  type    = number
  default = 512
}

variable "timeout_seconds" {
  description = "Lambda timeout; API Gateway caps requests at 30 s. Longer work goes to app-job (Fargate)."
  type        = number
  default     = 15
}

variable "reserved_concurrency" {
  description = "Hard ceiling on parallel executions: a spend guard and a cap on database connections."
  type        = number
  default     = 20
}

variable "throttle_rate" {
  type    = number
  default = 50
}

variable "throttle_burst" {
  type    = number
  default = 100
}

variable "custom_domain" {
  description = "{ name, certificate_arn } (regional ACM cert). The DNS alias record is made by the DNS stack from output api_domain_target."
  type = object({
    name            = string
    certificate_arn = string
  })
  default = null
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "log_retention_days" {
  type    = number
  default = 365
}
