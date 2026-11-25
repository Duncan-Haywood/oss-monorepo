terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.8"
    }
  }

  # Partial config: `tofu init -backend-config=backend.hcl` (backend.hcl.example).
  # The state bucket comes from platform/aws/bootstrap.
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

# The apps account, as in stacks/email (the edge API sits beside SES, so inbound mail stays in one account). It is found from the org
# stack's outputs; no account id is written here.
data "terraform_remote_state" "org" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "org/terraform.tfstate"
    region = var.region
  }
}

locals {
  apps_account_id = data.terraform_remote_state.org.outputs.account_ids["apps"]
  # The stack's own CI role (gha-oss-monorepo-edge-api-apply / -plan, from the
  # github-oidc stack) when given; else the organisation's member role, as
  # the other stacks under platform/aws/stacks/ reach member accounts.
  deploy_role_arn = coalesce(var.deploy_role_arn, "arn:aws:iam::${local.apps_account_id}:role/${var.member_role_name}")
}

provider "aws" {
  region = var.region

  assume_role {
    role_arn     = local.deploy_role_arn
    session_name = "opentofu-edge-api"
  }

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "edge-api"
      repo       = "oss-monorepo"
    }
  }
}
