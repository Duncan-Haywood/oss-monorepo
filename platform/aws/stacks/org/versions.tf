terraform {
  # use_lockfile (S3-native state locking) needs OpenTofu >= 1.10.
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }

  # Partial configuration: bucket, key, region and kms_key_id come from
  # -backend-config in .github/workflows/priv-aws-*.yml (see ../../README.md).
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      managed-by = "platform/aws/stacks/org"
      repository = "Duncan-Haywood/oss-monorepo"
    }
  }
}
