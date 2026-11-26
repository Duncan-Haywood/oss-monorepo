terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }

  # Partial config: `tofu init -backend-config=backend.hcl` (backend.hcl.example).
  # The state bucket comes from platform/aws/bootstrap.
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

# The shared-infra account: CI machines sit outside the apps account (the
# kill switch's target) and far from the payments account. It is found from
# the org stack's outputs; no account id is written here.
data "terraform_remote_state" "org" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "org/terraform.tfstate"
    region = var.region
  }
}

locals {
  account_id      = data.terraform_remote_state.org.outputs.account_ids["shared-infra"]
  deploy_role_arn = coalesce(var.deploy_role_arn, "arn:aws:iam::${local.account_id}:role/${var.member_role_name}")
}

provider "aws" {
  region = var.region

  assume_role {
    role_arn     = local.deploy_role_arn
    session_name = "opentofu-ci-runners"
  }

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "ci-runners"
      repo       = "oss-monorepo"
    }
  }
}
