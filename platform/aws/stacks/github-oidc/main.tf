# Per-stack CI roles in the workload accounts (shared-infra, apps, payments,
# security), each account with its own state bucket. See README.md.

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
  accounts = var.account_ids != null ? var.account_ids : data.terraform_remote_state.org[0].outputs.account_ids

  stacks_in = { for acct in ["security", "shared-infra", "apps", "payments"] :
    acct => { for name, s in var.stacks : name => {
      repo             = s.repo
      managed_policies = s.managed_policies
      extra_statements = s.extra_statements
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
  assume_role { role_arn = "arn:aws:iam::${local.accounts["security"]}:role/${var.member_role_name}" }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "shared_infra"
  region = var.region
  assume_role { role_arn = "arn:aws:iam::${local.accounts["shared-infra"]}:role/${var.member_role_name}" }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "apps"
  region = var.region
  assume_role { role_arn = "arn:aws:iam::${local.accounts["apps"]}:role/${var.member_role_name}" }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "payments"
  region = var.region
  assume_role { role_arn = "arn:aws:iam::${local.accounts["payments"]}:role/${var.member_role_name}" }
  default_tags { tags = local.tags }
}

module "security" {
  source       = "./account-roles"
  providers    = { aws = aws.security }
  region       = var.region
  github_owner = var.github_owner
  stacks       = local.stacks_in["security"]

  # Drains the findings queue into files on the security-alerts branch
  # (stacks/findings/ci/findings-to-files.yml), from a schedule on main.
  extra_roles = {
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
  stacks       = local.stacks_in["shared-infra"]
}

module "apps" {
  source       = "./account-roles"
  providers    = { aws = aws.apps }
  region       = var.region
  github_owner = var.github_owner
  stacks       = local.stacks_in["apps"]
}

module "payments" {
  source       = "./account-roles"
  providers    = { aws = aws.payments }
  region       = var.region
  github_owner = var.github_owner
  stacks       = local.stacks_in["payments"]
}
