# The management account: the only place AWS Organizations, SCPs and the
# Identity Center organization instance are administered.
provider "aws" {
  region = "us-east-1"

  dynamic "assume_role" {
    for_each = var.deploy_role_arn == null ? [] : [var.deploy_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "opentofu-org"
    }
  }

  allowed_account_ids = var.management_account_id == null ? null : [var.management_account_id]

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "org"
      repo       = "oss-monorepo"
    }
  }
}
