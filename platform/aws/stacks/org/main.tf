# The Organization, its OUs and member accounts (docs/reports/
# 2026-11-24-cloud-provider-comparison.md §7, "Account isolation").
#
# This account (the one the owner created and bootstrapped) becomes the
# management account. It holds only the Organization, billing, the
# organization trail's definition and the CI roles; no workload runs here.

locals {
  accounts = {
    log-archive  = { ou = "security", purpose = "write-once CloudTrail and Config logs" }
    security     = { ou = "security", purpose = "delegated admin for GuardDuty, Security Hub, Config, Access Analyzer" }
    shared-infra = { ou = "infrastructure", purpose = "DNS, the static site, shared networking" }
    apps         = { ou = "workloads", purpose = "products, Claude Platform on AWS, SES" }
    payments     = { ou = "payments", purpose = "Paddle webhook receiver and entitlements; no deploy role reachable from the public repository" }
    sandbox      = { ou = "sandbox", purpose = "experiments, tight budget" }
  }
  ous = toset(["security", "infrastructure", "workloads", "payments", "sandbox"])
}

resource "aws_organizations_organization" "this" {
  feature_set = "ALL"

  aws_service_access_principals = [
    "access-analyzer.amazonaws.com",
    "account.amazonaws.com",
    "cloudtrail.amazonaws.com",
    "config-multiaccountsetup.amazonaws.com",
    "config.amazonaws.com",
    "guardduty.amazonaws.com",
    "iam.amazonaws.com",
    "malware-protection.guardduty.amazonaws.com",
    "securityhub.amazonaws.com",
    "sso.amazonaws.com",
  ]

  enabled_policy_types = ["RESOURCE_CONTROL_POLICY", "SERVICE_CONTROL_POLICY"]
}

resource "aws_organizations_organizational_unit" "this" {
  for_each  = local.ous
  name      = each.key
  parent_id = aws_organizations_organization.this.roots[0].id
}

resource "aws_organizations_account" "this" {
  for_each = local.accounts

  name      = each.key
  email     = format(var.account_email_template, each.key)
  parent_id = aws_organizations_organizational_unit.this[each.value.ou].id
  # The role the management account's CI assumes to apply each member
  # account's baseline. Created by AWS Organizations with AdministratorAccess.
  role_name                  = "OrganizationAccountAccessRole"
  iam_user_access_to_billing = "DENY"
  close_on_deletion          = false

  tags = {
    purpose = each.value.purpose
  }

  lifecycle {
    # Changing these after creation is not supported by the API and would
    # force replacement (a new account).
    ignore_changes  = [role_name, iam_user_access_to_billing, email]
    prevent_destroy = true
  }
}

# Centralized root access: removes member accounts' root credentials and lets
# the management account run the few root-only tasks as short sessions.
resource "aws_iam_organizations_features" "root_access" {
  enabled_features = ["RootCredentialsManagement", "RootSessions"]
  depends_on       = [aws_organizations_organization.this]
}
