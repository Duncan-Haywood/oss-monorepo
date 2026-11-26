# Per-stack CI roles in the workload accounts (shared-infra, apps, payments,
# security), each account with its own state bucket. See README.md.
#
# Single-account mode (var.account_mode = "single"): the four per-account
# modules get nothing to make, and module.single makes every workload stack's
# roles in the one account, with their own state bucket and key (named apart
# from the bootstrap's), and the stacks/org workload-boundary on the CI roles
# too. Payments is left out: its isolation from this public repository rests
# on a separate account and an RCP, neither of which exists in one account,
# so it waits for an Organization (README.md, "Single-account mode").

data "terraform_remote_state" "org" {
  count   = var.account_ids == null ? 1 : 0
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "org/terraform.tfstate"
    region = var.region
  }
}

locals {
  single   = var.account_mode == "single"
  accounts = var.account_ids != null ? var.account_ids : data.terraform_remote_state.org[0].outputs.account_ids

  stacks_in = { for acct in ["security", "shared-infra", "apps", "payments"] :
    acct => { for name, s in var.stacks : name => {
      repo             = s.repo
      managed_policies = s.managed_policies
      extra_statements = s.extra_statements
      iam_prefixes     = s.iam_prefixes
    } if s.account == acct }
  }

  findings_queue_arn = "arn:aws:sqs:${var.region}:${local.accounts["security"]}:${var.findings_queue_name}"

  tags = {
    managed-by = "platform/aws/stacks/github-oidc"
    repository = "Duncan-Haywood/oss-monorepo"
  }
}

provider "aws" {
  alias  = "security"
  region = var.region
  dynamic "assume_role" {
    for_each = local.single ? [] : ["arn:aws:iam::${local.accounts["security"]}:role/${var.member_role_name}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "shared_infra"
  region = var.region
  dynamic "assume_role" {
    for_each = local.single ? [] : ["arn:aws:iam::${local.accounts["shared-infra"]}:role/${var.member_role_name}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "apps"
  region = var.region
  dynamic "assume_role" {
    for_each = local.single ? [] : ["arn:aws:iam::${local.accounts["apps"]}:role/${var.member_role_name}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "payments"
  region = var.region
  dynamic "assume_role" {
    for_each = local.single ? [] : ["arn:aws:iam::${local.accounts["payments"]}:role/${var.member_role_name}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

module "security" {
  source       = "./account-roles"
  providers    = { aws = aws.security }
  region       = var.region
  github_owner = var.github_owner
  stacks       = local.single ? {} : local.stacks_in["security"]

  # Single-account mode: the bootstrap's provider is the account's one.
  create_oidc_provider = !local.single

  # Drains the findings queue into files on the security-alerts branch
  # (stacks/findings/ci/findings-to-files.yml), from a schedule on main.
  extra_roles = local.single ? {} : local.extra_roles_security
}

locals {
  extra_roles_security = {
    gha-oss-monorepo-findings-read = {
      description = "Reads high and critical findings from the findings queue"
      subject     = "repo:${var.github_owner}/oss-monorepo:ref:refs/heads/main"
      statements = [{
        Sid      = "DrainFindingsQueue"
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
        Resource = local.findings_queue_arn
      }]
    }
  }
}

module "shared_infra" {
  source       = "./account-roles"
  providers    = { aws = aws.shared_infra }
  region       = var.region
  github_owner = var.github_owner
  stacks       = local.single ? {} : local.stacks_in["shared-infra"]

  create_oidc_provider = !local.single

  shared_state_stacks = ["dns"] # read by site
}

module "apps" {
  source       = "./account-roles"
  providers    = { aws = aws.apps }
  region       = var.region
  github_owner = var.github_owner
  stacks       = local.single ? {} : local.stacks_in["apps"]

  # The product stacks read saas-starter's state; email-ops reads edge-api's.
  shared_state_stacks = ["saas-starter", "edge-api"]

  # stacks/llm (applied earlier) already made the apps account's GitHub OIDC
  # provider; AWS allows one per URL per account, so reuse it.
  create_oidc_provider = false
}

module "payments" {
  source       = "./account-roles"
  providers    = { aws = aws.payments }
  region       = var.region
  github_owner = var.github_owner
  stacks       = local.single ? {} : local.stacks_in["payments"]

  create_oidc_provider = !local.single
}

module "single" {
  count        = local.single ? 1 : 0
  source       = "./account-roles"
  providers    = { aws = aws.apps }
  region       = var.region
  github_owner = var.github_owner
  stacks       = merge(local.stacks_in["security"], local.stacks_in["shared-infra"], local.stacks_in["apps"])
  extra_roles  = local.extra_roles_security

  shared_state_stacks  = ["dns", "saas-starter", "edge-api"]
  create_oidc_provider = false # the bootstrap's
  create_boundary      = false # stacks/org's
  boundary_on_ci_roles = true
  state_bucket_name    = "${local.accounts["apps"]}-tofu-state-workloads-${var.region}"
  state_kms_alias      = "alias/tofu-state-workloads"
}
