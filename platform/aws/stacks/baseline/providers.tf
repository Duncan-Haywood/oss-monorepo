data "terraform_remote_state" "org" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "org/terraform.tfstate"
    region = var.region
  }
}

locals {
  org         = data.terraform_remote_state.org.outputs
  accounts    = local.org.account_ids
  mgmt_id     = local.org.management_account_id
  member_role = var.member_role_name
  # Single-account mode: no Organization, every alias below is this account
  # (account_ids maps every name to it), and only the management baseline is
  # made; the trail, detectors and analyzer are the account's own.
  single   = var.account_mode == "single"
  boundary = try(local.org.permissions_boundary_arn, null)
  tags = {
    managed-by = "platform/aws/stacks/baseline"
    repository = "Duncan-Haywood/oss-monorepo"
  }
}

# Management account: the credentials the workflow assumed (github-plan or
# github-apply).
provider "aws" {
  region = var.region
  default_tags { tags = local.tags }
}

# One alias per member account. OpenTofu needs provider configurations to be
# static, so they are spelled out rather than generated.
provider "aws" {
  alias  = "log_archive"
  region = var.region
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.accounts["log-archive"]}:role/${local.member_role}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "security"
  region = var.region
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.accounts["security"]}:role/${local.member_role}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "shared_infra"
  region = var.region
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.accounts["shared-infra"]}:role/${local.member_role}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "apps"
  region = var.region
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.accounts["apps"]}:role/${local.member_role}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "payments"
  region = var.region
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.accounts["payments"]}:role/${local.member_role}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "sandbox"
  region = var.region
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.accounts["sandbox"]}:role/${local.member_role}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}
