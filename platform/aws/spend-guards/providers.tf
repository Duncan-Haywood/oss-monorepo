# Applied in the management (payer) account: consolidated billing is the only
# place a budget can watch every member account, and budget actions that
# attach service control policies must live there.
provider "aws" {
  region = var.region

  assume_role {
    role_arn     = var.deploy_role_arn
    session_name = "spend-guards"
  }

  allowed_account_ids = var.expected_account_id == null ? null : [var.expected_account_id]

  default_tags {
    tags = {
      managed_by = "opentofu"
      stack      = "spend-guards"
      repo       = "oss-monorepo"
    }
  }
}
