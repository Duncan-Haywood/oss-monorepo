terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }

  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

data "terraform_remote_state" "org" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "org/terraform.tfstate"
    region = var.region
  }
}

locals {
  shared_infra_account_id = data.terraform_remote_state.org.outputs.account_ids["shared-infra"]
  apps_account_id         = data.terraform_remote_state.org.outputs.account_ids["apps"]
  # One AWS account, no Organization: the read and operate policies go on
  # the two GitHub roles themselves and no member role is made
  # (cutover.py reads CUTOVER_SINGLE_ACCOUNT=true and assumes nothing).
  single_account = var.account_mode == "single"
  boundary       = try(data.terraform_remote_state.org.outputs.permissions_boundary_arn, null)
  tags = {
    managed-by = "platform/aws/stacks/cutover-access"
    repository = var.github_repository
  }
}

# Management account: the two roles GitHub assumes, the cutover secrets'
# home, and the Cloudflare stack's state.
provider "aws" {
  region = var.region
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "shared_infra"
  region = var.region
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.shared_infra_account_id}:role/${var.member_role_name}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "apps"
  region = var.region
  dynamic "assume_role" {
    for_each = var.account_mode == "single" ? [] : ["arn:aws:iam::${local.apps_account_id}:role/${var.member_role_name}"]
    content { role_arn = assume_role.value }
  }
  default_tags { tags = local.tags }
}
