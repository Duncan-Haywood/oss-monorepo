terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.7" }
  }
  # Partial config: copy backend.hcl.example (the PAYMENTS account's state bucket).
  backend "s3" {}
}

provider "aws" {
  region = var.region
  assume_role {
    role_arn     = var.deploy_role_arn
    session_name = "saas-starter-payments"
  }
  allowed_account_ids = var.allowed_account_ids
  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "saas-starter-payments"
      repo       = "private-monorepo"
    }
  }
}
