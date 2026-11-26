# IAM Identity Center for the owner's console access to member accounts (the
# Claude Platform on AWS sign-up happens in the apps account's console, and the
# root user cannot switch roles). AWS offers no API to enable the organization
# instance of Identity Center, so enabling it and creating the owner's user
# (with MFA) are console steps (docs/runbooks/aws-cutover.md, owner checklist).
# Once var.owner_identity_center_user_name is set, this file does the rest.
# Single-account mode: nothing here (an account instance of Identity Center
# has no member accounts to assign; the runbook's step 0 says what to do).

data "aws_ssoadmin_instances" "this" {}

locals {
  sso_enabled  = local.org && var.owner_identity_center_user_name != "" && length(data.aws_ssoadmin_instances.this.arns) > 0
  sso_arn      = local.sso_enabled ? tolist(data.aws_ssoadmin_instances.this.arns)[0] : null
  sso_store_id = local.sso_enabled ? tolist(data.aws_ssoadmin_instances.this.identity_store_ids)[0] : null
}

data "aws_identitystore_user" "owner" {
  count             = local.sso_enabled ? 1 : 0
  identity_store_id = local.sso_store_id

  alternate_identifier {
    unique_attribute {
      attribute_path  = "UserName"
      attribute_value = var.owner_identity_center_user_name
    }
  }
}

resource "aws_ssoadmin_permission_set" "owner_admin" {
  count            = local.sso_enabled ? 1 : 0
  name             = "OwnerAdmin"
  description      = "The owner's admin access to every account"
  instance_arn     = local.sso_arn
  session_duration = "PT4H"
}

resource "aws_ssoadmin_managed_policy_attachment" "owner_admin" {
  #checkov:skip=CKV_AWS_274:the owner is the administrator; MFA-backed SSO sessions of 4 hours
  count              = local.sso_enabled ? 1 : 0
  instance_arn       = local.sso_arn
  permission_set_arn = aws_ssoadmin_permission_set.owner_admin[0].arn
  managed_policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_ssoadmin_account_assignment" "owner" {
  for_each           = local.sso_enabled ? aws_organizations_account.this : {}
  instance_arn       = local.sso_arn
  permission_set_arn = aws_ssoadmin_permission_set.owner_admin[0].arn
  principal_id       = data.aws_identitystore_user.owner[0].user_id
  principal_type     = "USER"
  target_id          = each.value.id
  target_type        = "AWS_ACCOUNT"
}
