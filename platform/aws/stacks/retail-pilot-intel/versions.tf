terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.7" }
  }
  # Partial config: see backend.hcl.example (key retail-pilot-intel/terraform.tfstate).
  backend "s3" {}
}

provider "aws" {
  region = var.region
  assume_role {
    role_arn     = var.deploy_role_arn
    session_name = "retail-pilot-intel"
  }
  allowed_account_ids = var.allowed_account_ids
  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "retail-pilot-intel"
      repo       = "oss-monorepo"
      product    = "retail-pilot-intel"
    }
  }
}

# The shared platform (VPC, Postgres, KMS key, db-admin) from the saas-starter stack, same account and state bucket.
data "terraform_remote_state" "saas_starter" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = var.saas_starter_state_key
    region = var.region
  }
}
