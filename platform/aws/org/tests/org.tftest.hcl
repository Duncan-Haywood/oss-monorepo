# Invariants of the organization, checked against a mocked AWS provider.

mock_provider "aws" {
  override_resource {
    target = aws_organizations_organization.this
    values = {
      id                = "o-exampleorg1"
      master_account_id = "111111111111"
      roots             = [{ id = "r-root", arn = "arn:aws:organizations::111111111111:root/o-exampleorg1/r-root", name = "Root", policy_types = [] }]
    }
  }

  # Well-formed IDs: the provider validates them as it would real ones.
  override_resource {
    target = aws_organizations_organizational_unit.this
    values = { id = "ou-root-abcdefgh", arn = "arn:aws:organizations::111111111111:ou/o-exampleorg1/ou-root-abcdefgh" }
  }

  override_resource {
    target = aws_organizations_account.this
    values = { id = "222222222222", arn = "arn:aws:organizations::111111111111:account/o-exampleorg1/222222222222" }
  }

  override_resource {
    target = aws_organizations_policy.scp
    values = { id = "p-abcdefgh", arn = "arn:aws:organizations::111111111111:policy/o-exampleorg1/service_control_policy/p-abcdefgh" }
  }

  override_resource {
    target = aws_organizations_policy.rcp
    values = { id = "p-ijklmnop", arn = "arn:aws:organizations::111111111111:policy/o-exampleorg1/resource_control_policy/p-ijklmnop" }
  }

  override_data {
    target = data.aws_ssoadmin_instances.this
    values = {
      arns               = ["arn:aws:sso:::instance/ssoins-example"]
      identity_store_ids = ["d-example"]
    }
  }
}

variables {
  account_email_template = "aws+%s@example.org"
}

run "accounts_and_ous" {
  assert {
    condition     = length(aws_organizations_account.this) == 6
    error_message = "Six member accounts: log-archive, security, shared-infra, apps, payments, sandbox."
  }

  assert {
    condition     = local.member_accounts["payments"].ou == "payments" && length([for k, a in local.member_accounts : k if a.ou == "payments"]) == 1
    error_message = "The payments account sits alone in the Payments OU."
  }

  assert {
    condition     = aws_organizations_account.this["log-archive"].email == "aws+log-archive@example.org"
    error_message = "Account emails come from the template."
  }

  assert {
    condition     = alltrue([for a in aws_organizations_account.this : a.iam_user_access_to_billing == "DENY" && !a.close_on_deletion])
    error_message = "No IAM billing access; destroying state never closes an account."
  }

  assert {
    condition     = contains(aws_iam_organizations_features.this.enabled_features, "RootCredentialsManagement")
    error_message = "Member accounts must have no root credentials."
  }

  assert {
    condition     = length(output.account_ids) == 7 && output.account_ids["management"] == "111111111111"
    error_message = "account_ids covers the management account and the six members."
  }
}

run "scps_cover_the_required_denials" {
  assert {
    condition = anytrue([
      for s in jsondecode(aws_organizations_policy.scp["deny-exit-root-and-long-lived-keys"].content).Statement :
      s.Effect == "Deny" && contains(flatten([s.Action]), "organizations:LeaveOrganization")
    ])
    error_message = "Leaving the organization must be denied."
  }

  assert {
    condition = alltrue([
      for a in ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "guardduty:DeleteDetector", "config:StopConfigurationRecorder", "securityhub:DisableSecurityHub", "access-analyzer:DeleteAnalyzer", "s3:PutAccountPublicAccessBlock", "ec2:DisableEbsEncryptionByDefault"] :
      contains(jsondecode(aws_organizations_policy.scp["protect-security-baseline"].content).Statement[0].Action, a)
    ])
    error_message = "Disabling CloudTrail, GuardDuty, Config, Security Hub, Access Analyzer, BPA or EBS encryption must be denied."
  }

  assert {
    condition = alltrue([
      for r in jsondecode(aws_organizations_policy.scp["deny-unapproved-regions"].content).Statement[0].Condition.StringNotEquals["aws:RequestedRegion"] :
      contains(["us-east-1", "us-west-2"], r)
    ])
    error_message = "Only the approved regions are allowed."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_organizations_policy.scp["deny-exit-root-and-long-lived-keys"].content).Statement :
      s.Effect == "Deny" && try(s.Condition.ArnLike["aws:PrincipalArn"][0], "") == "arn:aws:iam::*:root"
    ])
    error_message = "Root-user actions must be denied."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_organizations_policy.scp["deny-exit-root-and-long-lived-keys"].content).Statement :
      contains(flatten([s.Action]), "iam:CreateAccessKey")
    ])
    error_message = "Access keys must be denied."
  }

  assert {
    condition     = alltrue([for p in aws_organizations_policy.scp : length(p.content) <= 5120])
    error_message = "Each SCP must fit AWS's 5,120-character limit."
  }

  assert {
    condition     = length([for k, v in aws_organizations_policy_attachment.scp : k if v.target_id == "r-root"]) <= 4
    error_message = "At most four of ours on the root (five per target, FullAWSAccess holds one)."
  }

  # Every exemption names only the baseline role.
  assert {
    condition = alltrue(flatten([
      for p in aws_organizations_policy.scp : [
        for s in jsondecode(p.content).Statement :
        alltrue([for a in try(s.Condition.ArnNotLike["aws:PrincipalArn"], []) : a == "arn:aws:iam::*:role/OrganizationAccountAccessRole"])
      ]
    ]))
    error_message = "SCP exemptions may name only OrganizationAccountAccessRole."
  }
}

run "rcps_fence_payments_and_data" {
  assert {
    condition     = local.rcps["payments-no-public-repo"].target == "payments" && aws_organizations_policy_attachment.rcp["payments-no-public-repo"].target_id == "ou-root-abcdefgh"
    error_message = "The payments RCP attaches to the Payments OU."
  }

  assert {
    condition     = jsondecode(aws_organizations_policy.rcp["payments-no-public-repo"].content).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"][0] == "repo:Duncan-Haywood/oss-monorepo:*"
    error_message = "The payments RCP refuses every token from the public repository."
  }

  assert {
    condition     = jsondecode(aws_organizations_policy.rcp["data-perimeter"].content).Statement[0].Condition.StringNotEqualsIfExists["aws:PrincipalOrgID"] == "o-exampleorg1"
    error_message = "The data perimeter is this organization."
  }

  assert {
    condition     = alltrue([for p in aws_organizations_policy.rcp : p.type == "RESOURCE_CONTROL_POLICY" && length(p.content) <= 5120])
    error_message = "RCPs are typed and within size."
  }
}

run "identity_center_waits_for_the_owner" {
  assert {
    condition     = length(aws_ssoadmin_permission_set.this) == 0 && length(aws_ssoadmin_account_assignment.this) == 0
    error_message = "Nothing in Identity Center until it is enabled."
  }
}

run "identity_center_when_enabled" {
  variables {
    identity_center_enabled = true
  }

  assert {
    condition     = length(aws_ssoadmin_account_assignment.this) == 14
    error_message = "Admin and read-only, in each of the seven accounts."
  }

  assert {
    condition     = aws_ssoadmin_permission_set.this["AdministratorAccess"].session_duration == "PT1H"
    error_message = "Admin sessions last at most an hour."
  }

  assert {
    condition     = alltrue([for a in aws_ssoadmin_account_assignment.this : a.principal_type == "GROUP"])
    error_message = "Access is granted to groups, never to individual users."
  }
}

run "bad_inputs_are_refused" {
  command = plan

  variables {
    account_email_template = "owner@example.org"
    allowed_regions        = ["eu-west-1"]
  }

  expect_failures = [var.account_email_template, var.allowed_regions]
}
