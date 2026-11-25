terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Partial configuration: values come from backend.hcl (copy
  # backend.hcl.example). The very first apply runs on local state through
  # bootstrap_override.tf (see README.md), because this stack creates the
  # bucket the backend points at.
  backend "s3" {
    use_lockfile = true
    # No `encrypt`/`kms_key_id` here: the bucket's default encryption puts
    # every object under the state KMS key, and `encrypt = true` without a
    # key ID would ask S3 for AES256 instead.
  }
}
