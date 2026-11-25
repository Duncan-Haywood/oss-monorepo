provider "aws" {
  region = var.region

  # Null on the very first apply (the owner's Identity Center admin session
  # runs it); the CI apply role afterwards.
  dynamic "assume_role" {
    for_each = var.deploy_role_arn == null ? [] : [var.deploy_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "opentofu-bootstrap"
    }
  }

  allowed_account_ids = var.expected_account_id == null ? null : [var.expected_account_id]

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "bootstrap"
      repo       = "oss-monorepo"
    }
  }
}
