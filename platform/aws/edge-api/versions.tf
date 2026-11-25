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

  # Partial config: `tofu init -backend-config=backend.hcl` (see backend.hcl.example).
  # The state bucket is created by the bootstrap stack.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  # The shared-infra account, reached by assuming its deploy role. No account
  # id or key is written here; CI gets short-lived credentials from GitHub OIDC.
  assume_role {
    role_arn     = var.deploy_role_arn
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
