locals {
  # Accounts the org stack creates; `management` is the account running it.
  member_accounts = {
    log-archive  = { ou = "security", purpose = "write-once logs: CloudTrail, Config" }
    security     = { ou = "security", purpose = "delegated admin for GuardDuty, Security Hub, Config, Access Analyzer" }
    shared-infra = { ou = "infrastructure", purpose = "DNS, the site, edge API, email" }
    apps         = { ou = "workloads", purpose = "products on the SaaS starter" }
    payments     = { ou = "payments", purpose = "Paddle webhook receiver and entitlements; private repository only" }
    sandbox      = { ou = "sandbox", purpose = "experiments, nothing that serves users" }
  }

  ou_names = {
    security       = "Security"
    infrastructure = "Infrastructure"
    workloads      = "Workloads"
    payments       = "Payments"
    sandbox        = "Sandbox"
    clients        = "Clients"
  }

  root_id = aws_organizations_organization.this.roots[0].id
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

  enabled_policy_types = [
    "RESOURCE_CONTROL_POLICY",
    "SERVICE_CONTROL_POLICY",
  ]

  lifecycle {
    prevent_destroy = true
  }
}

# Member accounts have no root password or access keys at all; root tasks
# are run, rarely, as short sessions from the management account.
resource "aws_iam_organizations_features" "this" {
  enabled_features = ["RootCredentialsManagement", "RootSessions"]

  depends_on = [aws_organizations_organization.this]
}

resource "aws_organizations_organizational_unit" "this" {
  for_each  = local.ou_names
  name      = each.value
  parent_id = local.root_id
}

resource "aws_organizations_account" "this" {
  for_each = local.member_accounts

  name      = "${var.name_prefix}-${each.key}"
  email     = format(var.account_email_template, each.key)
  parent_id = aws_organizations_organizational_unit.this[each.value.ou].id

  # The role the management account's foundation role chains into to apply
  # baseline/account and github-oidc. Protected by the SCPs below.
  role_name                  = "OrganizationAccountAccessRole"
  iam_user_access_to_billing = "DENY"
  close_on_deletion          = false

  tags = {
    account_purpose = each.value.purpose
  }

  lifecycle {
    prevent_destroy = true
    # AWS does not return these after creation; without this every plan
    # would propose replacing the account.
    ignore_changes = [role_name, iam_user_access_to_billing]
  }
}
