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
  }

  # Partial config: see backend.hcl.example. The state bucket comes from the
  # bootstrap stack.
  backend "s3" {
    use_lockfile = true
  }
}
