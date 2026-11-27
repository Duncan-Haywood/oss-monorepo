# GuardDuty, Security Hub (FSBP and CIS), AWS Config aggregation and IAM
# Access Analyzer for the whole organisation, administered from the security
# account (docs/reports/2026-11-24-cloud-provider-comparison.md §7).
#
# Single-account mode: no delegated administrator and no organisation
# configuration (count = 0 below). The one account runs its own GuardDuty
# detector (aws_guardduty_detector.security, whose alias is this account),
# Security Hub with FSBP and CIS subscribed directly, its own Config recorder
# (modules/account-baseline) and an account-scoped Access Analyzer.

# --- Delegated administrators (management account) --------------------------

resource "aws_guardduty_organization_admin_account" "this" {
  count            = local.single ? 0 : 1
  admin_account_id = local.accounts["security"]
}

resource "aws_securityhub_account" "management" {
  enable_default_standards = false
}

resource "aws_securityhub_organization_admin_account" "this" {
  count            = local.single ? 0 : 1
  admin_account_id = local.accounts["security"]
  depends_on       = [aws_securityhub_account.management]
}

resource "aws_organizations_delegated_administrator" "this" {
  for_each = local.single ? toset([]) : toset([
    "access-analyzer.amazonaws.com",
    "config.amazonaws.com",
    "config-multiaccountsetup.amazonaws.com",
  ])
  account_id        = local.accounts["security"]
  service_principal = each.key
}

# --- GuardDuty: on in every current and future account ----------------------

resource "aws_guardduty_detector" "security" {
  provider = aws.security
  enable   = true
}

resource "aws_guardduty_organization_configuration" "this" {
  count                            = local.single ? 0 : 1
  provider                         = aws.security
  detector_id                      = aws_guardduty_detector.security.id
  auto_enable_organization_members = "ALL"
  depends_on                       = [aws_guardduty_organization_admin_account.this]
}

# --- Security Hub: central configuration, FSBP and CIS everywhere -----------

resource "aws_securityhub_finding_aggregator" "this" {
  count        = local.single ? 0 : 1
  provider     = aws.security
  linking_mode = "ALL_REGIONS"
  depends_on   = [aws_securityhub_organization_admin_account.this]
}

resource "aws_securityhub_organization_configuration" "this" {
  count                 = local.single ? 0 : 1
  provider              = aws.security
  auto_enable           = false
  auto_enable_standards = "NONE"

  organization_configuration {
    configuration_type = "CENTRAL"
  }

  depends_on = [aws_securityhub_finding_aggregator.this]
}

resource "aws_securityhub_configuration_policy" "baseline" {
  count       = local.single ? 0 : 1
  provider    = aws.security
  name        = "baseline"
  description = "AWS Foundational Security Best Practices and CIS, every control on"

  configuration_policy {
    service_enabled       = true
    enabled_standard_arns = [for s in var.security_hub_standards : format(s, var.region)]

    security_controls_configuration {
      disabled_control_identifiers = []
    }
  }

  depends_on = [aws_securityhub_organization_configuration.this]
}

resource "aws_securityhub_configuration_policy_association" "root" {
  count     = local.single ? 0 : 1
  provider  = aws.security
  target_id = data.aws_organizations_organization.this[0].roots[0].id
  policy_id = aws_securityhub_configuration_policy.baseline[0].id
}

data "aws_organizations_organization" "this" {
  count = local.single ? 0 : 1
}

# --- AWS Config: one organisation-wide view in the security account ---------

data "aws_iam_policy_document" "config_aggregator_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "config_aggregator" {
  count              = local.single ? 0 : 1
  provider           = aws.security
  name               = "config-org-aggregator"
  assume_role_policy = data.aws_iam_policy_document.config_aggregator_trust.json
}

resource "aws_iam_role_policy_attachment" "config_aggregator" {
  count      = local.single ? 0 : 1
  provider   = aws.security
  role       = aws_iam_role.config_aggregator[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSConfigRoleForOrganizations"
}

resource "aws_config_configuration_aggregator" "org" {
  count    = local.single ? 0 : 1
  provider = aws.security
  name     = "organization"

  organization_aggregation_source {
    all_regions = true
    role_arn    = aws_iam_role.config_aggregator[0].arn
  }

  depends_on = [aws_organizations_delegated_administrator.this]
}

# --- IAM Access Analyzer: external access across the organisation ----------

# An organization analyzer needs Access Analyzer's service-linked role in the
# management account, even though the analyzer lives in the delegated admin
# (ConflictException on the first apply, run 45925800126).
resource "aws_iam_service_linked_role" "access_analyzer" {
  count            = local.single ? 0 : 1
  aws_service_name = "access-analyzer.amazonaws.com"
}

resource "aws_accessanalyzer_analyzer" "org" {
  provider      = aws.security
  analyzer_name = local.single ? "account" : "organization"
  type          = local.single ? "ACCOUNT" : "ORGANIZATION"
  depends_on    = [aws_organizations_delegated_administrator.this, aws_iam_service_linked_role.access_analyzer]
}

# --- Single-account mode: Security Hub standards on the account itself -----

resource "aws_securityhub_standards_subscription" "single" {
  for_each      = local.single ? toset([for s in var.security_hub_standards : format(s, var.region)]) : toset([])
  standards_arn = each.value
  depends_on    = [aws_securityhub_account.management]
}
