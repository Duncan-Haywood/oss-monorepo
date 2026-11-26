variable "region" {
  type    = string
  default = "us-east-1"
  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "region must be us-east-1 or us-west-2 (same as the saas-starter stack)."
  }
}

variable "deploy_role_arn" {
  description = "Role in the apps account that this repository's CI assumes to apply the grants product (IAM names saas-starter-grants*)."
  type        = string
}

variable "allowed_account_ids" {
  description = "[apps account id]. null = no guard (tests)."
  type        = list(string)
  default     = null
}

variable "state_bucket" {
  description = "Apps account state bucket holding the saas-starter and llm stacks' state (read-only here)."
  type        = string
}

variable "saas_starter_state_key" {
  type    = string
  default = "stacks/saas-starter/terraform.tfstate"
}

variable "llm_state_key" {
  description = "State key of oss-monorepo stacks/llm (Claude Platform on AWS). null = grants keeps the first-party Anthropic API key from its app secret."
  type        = string
  default     = "stacks/llm/terraform.tfstate"
}

variable "build_dir" {
  description = "Directory holding app-grants/ (scripts/aws/build-lambda.sh output)."
  type        = string
  default     = "../../dist-aws"
}

variable "app_url" {
  description = "Public origin of the AWS deployment, e.g. https://grants-aws.marisstella.app while both run, https://marisstella.app after cutover."
  type        = string
  validation {
    condition     = can(regex("^https://[a-z0-9.-]+$", var.app_url))
    error_message = "app_url must be an https origin without a path."
  }
}

variable "base_path" {
  description = "BASE_PATH as on the Worker (\"/grants\" in production, \"\" for a dedicated host)."
  type        = string
  default     = "/grants"
}

variable "custom_domain" {
  description = "{ name, certificate_arn } for the API Gateway custom domain (regional ACM cert). null = execute-api URL only."
  type = object({
    name            = string
    certificate_arn = string
  })
  default = null
}

variable "auth_domain_prefix" {
  description = "Cognito hosted-UI prefix the starter's module requires. Grants keeps Better Auth until a later, separate migration; the pool is created but unused."
  type        = string
  default     = "grant-autopilot"
}

variable "ses_identity_arn" {
  description = "stacks/email identity ARN to send from (EMAIL_PROVIDER=ses). null = no SES permission."
  type        = string
  default     = null
}

variable "ses_configuration_set" {
  type    = string
  default = null
}

variable "email_from" {
  type    = string
  default = "Grant Autopilot <no-reply@marisstella.app>"
}

variable "billing_on_aws" {
  description = "Paddle checkouts + entitlement sync on this deployment. Keep false while both run; set true only after the D1 data is loaded (docs/AWS.md, cutover step 5): the sync binds orgs through pending_checkouts rows that must already be in Postgres."
  type        = bool
  default     = false
}

variable "billing_price_ids" {
  description = "Paddle price ids by checkout key (public values, not secrets), e.g. {starter = \"pri_...\", \"starter:annual\" = \"pri_...\"}."
  type        = map(string)
  default     = {}
}

variable "vars" {
  description = "Extra non-secret Worker vars to carry over (wrangler.jsonc vars / deploy-time vars)."
  type        = map(string)
  default     = {}
}

variable "deletion_protection" {
  type    = bool
  default = true
}
