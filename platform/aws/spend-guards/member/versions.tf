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

provider "aws" {
  region = "us-east-1"

  assume_role {
    role_arn     = var.deploy_role_arn
    session_name = "spend-guards-member"
  }

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "spend-guards-member"
      repo       = "oss-monorepo"
    }
  }
}
