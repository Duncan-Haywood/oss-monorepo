variable "region" {
  type    = string
  default = "us-east-1"
  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "region must be us-east-1 or us-west-2."
  }
}

variable "deploy_role_arn" {
  description = "Deploy role in the payments account: gha-private-monorepo-payments-plan (pull_request) or -apply (GitHub environment aws-prod, main only). Both trust only this repository (oss-monorepo stacks/github-oidc)."
  type        = string
}

variable "allowed_account_ids" {
  description = "[payments account id]. null = no guard (tests)."
  type        = list(string)
  default     = null
}

variable "build_dir" {
  description = "Directory holding paddle-webhook/ (the starter runtime's `node build.mjs platform` output)."
  type        = string
}

variable "queue_url" {
  description = "saas-starter (apps account) output entitlement_queue_url"
  type        = string
}

variable "queue_arn" {
  description = "saas-starter output entitlement_queue_arn"
  type        = string
  validation {
    condition     = can(regex("^arn:aws:sqs:[a-z0-9-]+:[0-9]{12}:[A-Za-z0-9_-]+$", var.queue_arn))
    error_message = "queue_arn must be an SQS queue ARN."
  }
}

variable "queue_kms_key_arn" {
  description = "saas-starter output entitlement_queue_kms_key_arn"
  type        = string
}

variable "alarm_topic_arn" {
  type    = string
  default = null
}

variable "permissions_boundary_arn" {
  description = "arn:aws:iam::<payments-account-id>:policy/workload-boundary. The apply role may only create roles that carry it, so it is required outside tests."
  type        = string
  default     = null
}
