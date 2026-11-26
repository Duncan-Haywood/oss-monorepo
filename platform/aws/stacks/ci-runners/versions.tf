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
  account_id = data.terraform_remote_state.org.outputs.account_ids["shared-infra"]
  # Single-account mode without a CI role: the workflow's own credentials.
  deploy_role_arn = var.deploy_role_arn != null ? var.deploy_role_arn : (var.account_mode == "single" ? null : "arn:aws:iam::${local.account_id}:role/${var.member_role_name}")
  # Single-account mode: stacks/org's workload-boundary unless one is given.
  boundary = var.permissions_boundary_arn != null ? var.permissions_boundary_arn : try(data.terraform_remote_state.org.outputs.permissions_boundary_arn, null)
}

provider "aws" {
  region = var.region

  dynamic "assume_role" {
    for_each = local.deploy_role_arn == null ? [] : [local.deploy_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "opentofu-ci-runners"
    }
  }

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "ci-runners"
      repo       = "oss-monorepo"
    }
  }
}
