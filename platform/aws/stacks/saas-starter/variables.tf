variable "region" {
  description = "Home region (allowed: us-east-2, us-east-1, us-west-2)."
  type        = string
  default     = "us-east-2"
  validation {
    condition     = contains(["us-east-2", "us-east-1", "us-west-2"], var.region)
    error_message = "region must be us-east-2, us-east-1 or us-west-2."
  }
}

variable "deploy_role_arn" {
  description = "Role in the apps account that CI assumes (gha-oss-monorepo-saas-starter-plan / -apply)."
  type        = string
}

variable "allowed_account_ids" {
  description = "Guard against applying to the wrong account: [apps account id]. Empty = no guard (tests)."
  type        = list(string)
  default     = null
}

variable "payments_account_id" {
  description = "The payments account id (organization stack output). Only its webhook role may write the entitlement queue."
  type        = string
}

variable "build_dir" {
  description = "Where runtime/build.mjs wrote the bundles."
  type        = string
  default     = null
}

variable "alarm_topic_arn" {
  description = "SNS topic for operational alarms (security/spend-guards stack output). null = alarms without actions."
  type        = string
  default     = null
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "db_enable_proxy" {
  type    = bool
  default = false
}

variable "interface_endpoints" {
  description = "Add ecr.api, ecr.dkr and logs when a product uses app-job (Fargate)."
  type        = list(string)
  default     = ["secretsmanager", "sns"]
}

variable "example_product" {
  description = "Deploy the hello example product (proves the platform end to end after the first apply; remove once a real product is live)."
  type = object({
    enabled           = bool
    domain_prefix     = optional(string, "")
    web_callback_urls = optional(list(string), ["http://localhost:8787/auth/callback"])
  })
  default = { enabled = false }
}

variable "permissions_boundary_arn" {
  description = "The apps account's workload-boundary policy (stacks/github-oidc output). Attached to every role this stack creates. null only in tests or before that stack exists."
  type        = string
  default     = null
}

variable "payments_sender_role_name" {
  description = "Role name of the Paddle receiver in the payments account (saas-starter/payments). Change both or neither."
  type        = string
  default     = "payments-paddle-webhook"
}

variable "enable_nat" {
  description = "Give private subnets outbound internet through one NAT gateway (~$33/month + $0.045/GB). Needed for Claude Platform on AWS (stacks/llm) and any non-AWS API."
  type        = bool
  default     = false
}
