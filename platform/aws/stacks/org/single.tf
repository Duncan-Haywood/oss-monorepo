# Single-account mode: what stands in for the SCPs (README.md, "Single-account
# mode"). Every role a stack creates in this account carries this boundary;
# the bootstrap's github-apply carries the matching explicit denies itself
# (bootstrap.yaml, AccountMode=single), because a boundary cannot be put on
# the role that applies it.

data "aws_caller_identity" "this" {}

module "boundary" {
  count  = local.org ? 0 : 1
  source = "../../modules/workload-boundary"

  account_id              = data.aws_caller_identity.this.account_id
  single_account          = true
  allowed_regions         = var.allowed_regions
  global_service_actions  = local.global_service_actions
  management_state_bucket = "${data.aws_caller_identity.this.account_id}-tofu-state-${var.region}"
}
