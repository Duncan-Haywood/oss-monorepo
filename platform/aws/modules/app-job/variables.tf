variable "name" {
  type = string
}

variable "image" {
  description = "Container image pinned by digest, e.g. <account>.dkr.ecr.us-east-1.amazonaws.com/grants-jobs@sha256:..."
  type        = string
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.image))
    error_message = "image must be pinned by digest (…@sha256:<64 hex>)."
  }
}

variable "cpu" {
  description = "Fargate vCPU units (256 = 0.25 vCPU, about $0.01/hour on ARM)."
  type        = number
  default     = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "environment" {
  type    = map(string)
  default = {}
}

variable "secrets" {
  description = "Env var name -> Secrets Manager secret name, injected by ECS at start."
  type        = map(string)
  default     = {}
}

variable "task_policy_json" {
  description = "What the job itself may do (e.g. rds-db:connect to its app user, S3 on its bucket). Least privilege, no wildcards."
  type        = string
  default     = null
}

variable "container_insights" {
  description = "Per-task metrics; extra CloudWatch cost."
  type        = bool
  default     = false
}

variable "log_retention_days" {
  type    = number
  default = 365
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary attached to every IAM role this module creates (the account's workload-boundary from stacks/github-oidc). null = none."
  type        = string
  default     = null
}
