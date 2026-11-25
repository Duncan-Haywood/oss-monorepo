data "terraform_remote_state" "org" {
  count   = var.account_ids == null || var.organization_id == null || var.organization_root_id == null ? 1 : 0
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "stacks/org/terraform.tfstate"
    region = "us-east-1"
  }
}

data "terraform_remote_state" "bootstrap" {
  count   = var.trail_data_event_bucket_arns == null ? 1 : 0
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "stacks/bootstrap/terraform.tfstate"
    region = "us-east-1"
  }
}

locals {
  account_ids     = var.account_ids != null ? var.account_ids : data.terraform_remote_state.org[0].outputs.account_ids
  organization_id = var.organization_id != null ? var.organization_id : data.terraform_remote_state.org[0].outputs.organization_id
  data_buckets    = var.trail_data_event_bucket_arns != null ? var.trail_data_event_bucket_arns : [data.terraform_remote_state.bootstrap[0].outputs.state_bucket_arn]

  management_id  = local.account_ids["management"]
  log_archive_id = local.account_ids["log-archive"]
  security_id    = local.account_ids["security"]

  tags = {
    managed_by = "opentofu"
    stack      = "baseline"
    repo       = "oss-monorepo"
  }
}

provider "aws" {
  region = "us-east-1"
  dynamic "assume_role" {
    for_each = var.deploy_role_arn == null ? [] : [var.deploy_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "opentofu-baseline"
    }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "management_west"
  region = "us-west-2"
  dynamic "assume_role" {
    for_each = var.deploy_role_arn == null ? [] : [var.deploy_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "opentofu-baseline"
    }
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias               = "log_archive"
  region              = "us-east-1"
  allowed_account_ids = [local.log_archive_id]
  assume_role {
    role_arn     = "arn:aws:iam::${local.log_archive_id}:role/${var.member_role_name}"
    session_name = "opentofu-baseline"
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias               = "security"
  region              = "us-east-1"
  allowed_account_ids = [local.security_id]
  assume_role {
    role_arn     = "arn:aws:iam::${local.security_id}:role/${var.member_role_name}"
    session_name = "opentofu-baseline"
  }
  default_tags { tags = local.tags }
}

provider "aws" {
  alias               = "security_west"
  region              = "us-west-2"
  allowed_account_ids = [local.security_id]
  assume_role {
    role_arn     = "arn:aws:iam::${local.security_id}:role/${var.member_role_name}"
    session_name = "opentofu-baseline"
  }
  default_tags { tags = local.tags }
}
