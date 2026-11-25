terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }

  # Partial configuration, like every stack here (../../README.md): the
  # management account's state bucket, key github-oidc/terraform.tfstate.
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
