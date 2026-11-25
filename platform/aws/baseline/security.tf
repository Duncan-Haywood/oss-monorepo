# Organization-wide security services, administered from the security
# account. Security Hub uses central configuration: one policy (AWS
# Foundational Security Best Practices + CIS 3.0) applied to the whole
# organization, findings from us-west-2 aggregated into us-east-1.

locals {
  organization_root_id = var.organization_root_id != null ? var.organization_root_id : data.terraform_remote_state.org[0].outputs.organization_root_id

  securityhub_standards = [
    "arn:aws:securityhub:us-east-1::standards/aws-foundational-security-best-practices/v/1.0.0",
    "arn:aws:securityhub:us-east-1::standards/cis-aws-foundations-benchmark/v/3.0.0",
  ]
}

resource "aws_organizations_delegated_administrator" "this" {
  for_each          = toset(["access-analyzer.amazonaws.com", "config.amazonaws.com"])
  account_id        = local.security_id
  service_principal = each.value
}

module "regional_east" {
  source              = "./regional"
  security_account_id = local.security_id
  name_prefix         = var.name_prefix
  region_label        = "us-east-1"
  providers = {
    aws.management = aws
    aws.security   = aws.security
  }
  depends_on = [aws_organizations_delegated_administrator.this]
}

module "regional_west" {
  source              = "./regional"
  security_account_id = local.security_id
  name_prefix         = var.name_prefix
  region_label        = "us-west-2"
  providers = {
    aws.management = aws.management_west
    aws.security   = aws.security_west
  }
  depends_on = [aws_organizations_delegated_administrator.this]
}

# Security Hub ---------------------------------------------------------------

resource "aws_securityhub_account" "management" {
  enable_default_standards = false
}

resource "aws_securityhub_organization_admin_account" "this" {
  admin_account_id = local.security_id
  depends_on       = [aws_securityhub_account.management]
}

resource "aws_securityhub_finding_aggregator" "this" {
  provider          = aws.security
  linking_mode      = "SPECIFIED_REGIONS"
  specified_regions = ["us-west-2"]
  depends_on        = [aws_securityhub_organization_admin_account.this]
}

resource "aws_securityhub_organization_configuration" "this" {
  provider              = aws.security
  auto_enable           = false
  auto_enable_standards = "NONE"
  organization_configuration {
    configuration_type = "CENTRAL"
  }
  depends_on = [aws_securityhub_finding_aggregator.this]
}

resource "aws_securityhub_configuration_policy" "baseline" {
  provider    = aws.security
  name        = "${var.name_prefix}-baseline"
  description = "FSBP and CIS 3.0 in every account and region"

  configuration_policy {
    service_enabled       = true
    enabled_standard_arns = local.securityhub_standards
    security_controls_configuration {
      disabled_control_identifiers = []
    }
  }

  depends_on = [aws_securityhub_organization_configuration.this]
}

resource "aws_securityhub_configuration_policy_association" "root" {
  provider  = aws.security
  target_id = local.organization_root_id
  policy_id = aws_securityhub_configuration_policy.baseline.id
}

# AWS Config: an organization aggregator in the security account. The
# recorders themselves are per account and region (baseline/account).

resource "aws_iam_role" "config_aggregator" {
  provider = aws.security
  name     = "${var.name_prefix}-config-aggregator"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "config.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = local.security_id } }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "config_aggregator" {
  provider   = aws.security
  role       = aws_iam_role.config_aggregator.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSConfigRoleForOrganizations"
}

resource "aws_config_configuration_aggregator" "org" {
  provider = aws.security
  name     = "${var.name_prefix}-org"
  organization_aggregation_source {
    all_regions = true
    role_arn    = aws_iam_role.config_aggregator.arn
  }
  depends_on = [aws_organizations_delegated_administrator.this, aws_iam_role_policy_attachment.config_aggregator]
}
