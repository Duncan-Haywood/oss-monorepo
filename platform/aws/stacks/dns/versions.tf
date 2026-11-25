terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Partial configuration: see backend.hcl.example. The state bucket comes
  # from the bootstrap stack.
  backend "s3" {}
}

provider "aws" {
  # Route 53 is global; query logs must go to us-east-1.
  region              = "us-east-1"
  allowed_account_ids = var.allowed_account_ids

  assume_role {
    role_arn     = var.deploy_role_arn
    session_name = "opentofu-dns"
  }

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "dns"
      repo       = "oss-monorepo"
    }
  }
}
