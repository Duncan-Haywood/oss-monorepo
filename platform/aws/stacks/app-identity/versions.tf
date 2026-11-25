terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "2.8.1"
    }
  }

  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

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
}

# The transitional identity lives in the apps account, beside what it calls.
provider "aws" {
  region = var.region
  assume_role { role_arn = "arn:aws:iam::${local.apps_account_id}:role/${var.member_role_name}" }
  default_tags {
    tags = {
      managed-by = "platform/aws/stacks/app-identity"
      repository = "Duncan-Haywood/oss-monorepo"
    }
  }
}

data "terraform_remote_state" "llm" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "llm/terraform.tfstate"
    region = var.region
  }
}

data "terraform_remote_state" "email" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "email/terraform.tfstate"
    region = var.region
  }
}
