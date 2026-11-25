data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_organizations_organization" "current" {}

data "terraform_remote_state" "org" {
  count   = var.org_state == null ? 0 : 1
  backend = "s3"
  config = {
    bucket       = var.org_state.bucket
    key          = var.org_state.key
    region       = var.org_state.region
    use_lockfile = true
  }
}

locals {
  partition     = data.aws_partition.current.partition
  mgmt_id       = data.aws_caller_identity.current.account_id
  org_id        = data.aws_organizations_organization.current.id
  org_ids       = var.org_state == null ? {} : try(data.terraform_remote_state.org[0].outputs.account_ids, {})
  name          = "spend-guards"
  kill_role_arn = "arn:${local.partition}:iam::*:role/${var.kill_switch_role_name}"

  accounts = {
    for k, a in var.accounts : k => merge(a, { id = coalesce(a.id, lookup(local.org_ids, k, null), "unset") })
  }
  scp_accounts = { for k, a in local.accounts : k => a if a.hard_action == "scp" }
}

# Fail the plan, not just warn: a budget with no account filter would watch
# the whole bill and its SCP would have nowhere to go.
resource "terraform_data" "account_ids_known" {
  lifecycle {
    precondition {
      condition     = alltrue([for a in values(local.accounts) : a.id != "unset"])
      error_message = "Some accounts have no id: set it in accounts or provide org_state with an account_ids output."
    }
  }
}
