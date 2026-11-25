data "terraform_remote_state" "bootstrap" {
  count   = var.state_bucket_arn == null || var.state_kms_key_arn == null ? 1 : 0
  backend = "s3"
  config  = { bucket = var.state_bucket, key = "stacks/bootstrap/terraform.tfstate", region = "us-east-1" }
}

data "terraform_remote_state" "org" {
  count   = var.account_ids == null || var.clients_ou_path == null ? 1 : 0
  backend = "s3"
  config  = { bucket = var.state_bucket, key = "stacks/org/terraform.tfstate", region = "us-east-1" }
}

data "terraform_remote_state" "baseline" {
  count   = var.findings_queue_arn == null ? 1 : 0
  backend = "s3"
  config  = { bucket = var.state_bucket, key = "stacks/baseline/terraform.tfstate", region = "us-east-1" }
}

locals {
  account_ids        = var.account_ids != null ? var.account_ids : data.terraform_remote_state.org[0].outputs.account_ids
  state_bucket_arn   = var.state_bucket_arn != null ? var.state_bucket_arn : data.terraform_remote_state.bootstrap[0].outputs.state_bucket_arn
  state_kms_key_arn  = var.state_kms_key_arn != null ? var.state_kms_key_arn : data.terraform_remote_state.bootstrap[0].outputs.state_kms_key_arn
  findings_queue_arn = var.findings_queue_arn != null ? var.findings_queue_arn : data.terraform_remote_state.baseline[0].outputs.findings_queue_arn

  clients_ou_path = var.clients_ou_path != null ? var.clients_ou_path : format(
    "%s/%s/%s/",
    data.terraform_remote_state.org[0].outputs.organization_id,
    data.terraform_remote_state.org[0].outputs.organization_root_id,
    data.terraform_remote_state.org[0].outputs.ou_ids["clients"],
  )

  # client-accounts may enter only accounts under the Clients OU.
  enter_clients = [{
    Sid       = "EnterClientAccountsOnly"
    Effect    = "Allow"
    Action    = "sts:AssumeRole"
    Resource  = "arn:aws:iam::*:role/OrganizationAccountAccessRole"
    Condition = { "ForAnyValue:StringLike" = { "aws:ResourceOrgPaths" = ["${local.clients_ou_path}*"] } }
  }]

  stacks_in = { for acct in ["management", "security", "shared-infra", "apps", "payments"] :
    acct => { for name, s in var.stacks : name => {
      repo             = s.repo
      managed_policies = s.managed_policies
      extra_statements = concat(s.extra_statements, name == "client-accounts" ? local.enter_clients : [])
    } if s.account == acct }
  }

  tags = {
    managed_by = "opentofu"
    stack      = "github-oidc"
    repo       = "oss-monorepo"
  }
}

provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [local.account_ids["management"]]
  dynamic "assume_role" {
    for_each = var.deploy_role_arn == null ? [] : [var.deploy_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "opentofu-github-oidc"
    }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias               = "security"
  region              = "us-east-1"
  allowed_account_ids = [local.account_ids["security"]]
  assume_role {
    role_arn     = "arn:aws:iam::${local.account_ids["security"]}:role/${var.member_role_name}"
    session_name = "opentofu-github-oidc"
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias               = "shared_infra"
  region              = "us-east-1"
  allowed_account_ids = [local.account_ids["shared-infra"]]
  assume_role {
    role_arn     = "arn:aws:iam::${local.account_ids["shared-infra"]}:role/${var.member_role_name}"
    session_name = "opentofu-github-oidc"
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias               = "apps"
  region              = "us-east-1"
  allowed_account_ids = [local.account_ids["apps"]]
  assume_role {
    role_arn     = "arn:aws:iam::${local.account_ids["apps"]}:role/${var.member_role_name}"
    session_name = "opentofu-github-oidc"
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias               = "payments"
  region              = "us-east-1"
  allowed_account_ids = [local.account_ids["payments"]]
  assume_role {
    role_arn     = "arn:aws:iam::${local.account_ids["payments"]}:role/${var.member_role_name}"
    session_name = "opentofu-github-oidc"
  }
  default_tags { tags = local.tags }
}

module "management" {
  source               = "./account-roles"
  github_owner         = var.github_owner
  create_oidc_provider = false # the CloudFormation seed made it
  state_bucket_arn     = local.state_bucket_arn
  state_kms_key_arn    = local.state_kms_key_arn
  stacks               = local.stacks_in["management"]
}

module "security" {
  source            = "./account-roles"
  providers         = { aws = aws.security }
  github_owner      = var.github_owner
  state_bucket_arn  = local.state_bucket_arn
  state_kms_key_arn = local.state_kms_key_arn
  stacks            = local.stacks_in["security"]

  # Drains the findings queue into files (security-alerts branch), from a
  # scheduled workflow on main.
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
  source            = "./account-roles"
  providers         = { aws = aws.shared_infra }
  github_owner      = var.github_owner
  state_bucket_arn  = local.state_bucket_arn
  state_kms_key_arn = local.state_kms_key_arn
  stacks            = local.stacks_in["shared-infra"]
}

module "apps" {
  source            = "./account-roles"
  providers         = { aws = aws.apps }
  github_owner      = var.github_owner
  state_bucket_arn  = local.state_bucket_arn
  state_kms_key_arn = local.state_kms_key_arn
  stacks            = local.stacks_in["apps"]
}

module "payments" {
  source            = "./account-roles"
  providers         = { aws = aws.payments }
  github_owner      = var.github_owner
  state_bucket_arn  = local.state_bucket_arn
  state_kms_key_arn = local.state_kms_key_arn
  stacks            = local.stacks_in["payments"]
}
