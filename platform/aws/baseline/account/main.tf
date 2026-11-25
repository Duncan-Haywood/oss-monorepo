# Applies modules/account-baseline to one account in one region. CI runs it
# once per account and allowed region (apply-all.sh), each with its own state
# key: stacks/baseline-account/<account>/<region>/terraform.tfstate.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    use_lockfile = true
  }
}

variable "deploy_role_arn" {
  description = "Null in the management account (the foundation role acts directly); OrganizationAccountAccessRole in a member account (apply-all.sh sets it)."
  type        = string
  default     = null
}

variable "account_name" {
  description = "Account name, a key of the org stack's account_ids."
  type        = string
}

variable "account_id" {
  description = "The target account; the provider refuses any other."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "A 12-digit account ID."
  }
}

variable "region" {
  description = "An allowed region."
  type        = string

  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "Only us-east-1 and us-west-2."
  }
}

variable "config_bucket_name" {
  description = "baseline output log_archive_bucket_name."
  type        = string
}

variable "config_kms_key_arn" {
  description = "baseline output log_archive_kms_key_arn."
  type        = string
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]

  dynamic "assume_role" {
    for_each = var.deploy_role_arn == null ? [] : [var.deploy_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "opentofu-baseline-account"
    }
  }

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "baseline-account"
      repo       = "oss-monorepo"
    }
  }
}

module "baseline" {
  source                  = "../../modules/account-baseline"
  account_name            = var.account_name
  manage_global_resources = var.region == "us-east-1"
  config_bucket_name      = var.config_bucket_name
  config_kms_key_arn      = var.config_kms_key_arn
}

output "kms_key_arn" {
  description = "The account's default key in this region."
  value       = module.baseline.kms_key_arn
}
