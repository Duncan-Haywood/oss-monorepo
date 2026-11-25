# IAM Identity Center: how people (the owner) reach every account. The
# organization instance must be enabled by hand first (no API), so all of
# this waits for var.identity_center_enabled.
#
# MFA: Identity Center's "require MFA at every sign-in" and the allowed
# authenticator types are instance settings with no API either; the owner
# sets them once (platform/aws/README.md, turnover step 6). Sessions here are
# short so a stolen browser session expires quickly. No permission-set policy
# checks aws:MultiFactorAuthPresent: Identity Center sessions are not
# documented to carry that key, and a deny on its absence would lock the
# owner out.

data "aws_ssoadmin_instances" "this" {
  count = var.identity_center_enabled ? 1 : 0
}

locals {
  sso_instance_arn  = var.identity_center_enabled ? tolist(data.aws_ssoadmin_instances.this[0].arns)[0] : null
  identity_store_id = var.identity_center_enabled ? tolist(data.aws_ssoadmin_instances.this[0].identity_store_ids)[0] : null

  all_account_ids = merge(
    { management = aws_organizations_organization.this.master_account_id },
    { for name, acct in aws_organizations_account.this : name => acct.id }
  )

  permission_sets = {
    AdministratorAccess = {
      description      = "Full administration; owner only, MFA at every sign-in."
      session_duration = "PT1H"
      managed_policy   = "arn:aws:iam::aws:policy/AdministratorAccess"
      group            = "platform-admins"
    }
    ReadOnlyAccess = {
      description      = "Read-only, for looking without risk."
      session_duration = "PT4H"
      managed_policy   = "arn:aws:iam::aws:policy/ReadOnlyAccess"
      group            = "platform-readonly"
    }
  }

  # Every permission set in every account.
  sso_assignments = var.identity_center_enabled ? {
    for pair in setproduct(keys(local.permission_sets), keys(local.all_account_ids)) :
    "${pair[0]}/${pair[1]}" => { permission_set = pair[0], account = pair[1] }
  } : {}
}

resource "aws_ssoadmin_permission_set" "this" {
  for_each         = var.identity_center_enabled ? local.permission_sets : {}
  name             = each.key
  description      = each.value.description
  instance_arn     = local.sso_instance_arn
  session_duration = each.value.session_duration
}

resource "aws_ssoadmin_managed_policy_attachment" "this" {
  for_each           = var.identity_center_enabled ? local.permission_sets : {}
  instance_arn       = local.sso_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.this[each.key].arn
  managed_policy_arn = each.value.managed_policy
}

resource "aws_identitystore_group" "this" {
  for_each          = var.identity_center_enabled ? toset([for ps in values(local.permission_sets) : ps.group]) : toset([])
  identity_store_id = local.identity_store_id
  display_name      = each.key
  description       = "Managed by platform/aws/org. Add people in Identity Center; access comes from the group."
}

resource "aws_ssoadmin_account_assignment" "this" {
  for_each           = local.sso_assignments
  instance_arn       = local.sso_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.this[each.value.permission_set].arn
  principal_type     = "GROUP"
  principal_id       = aws_identitystore_group.this[local.permission_sets[each.value.permission_set].group].group_id
  target_type        = "AWS_ACCOUNT"
  target_id          = local.all_account_ids[each.value.account]
}
