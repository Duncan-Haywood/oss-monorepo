# `tofu test` with a mocked AWS provider: no credentials, no AWS calls.
# Checks the plan's shape, not AWS's acceptance of it.

mock_provider "aws" {
  mock_resource "aws_organizations_organization" {
    defaults = {
      roots             = [{ id = "r-abcd", arn = "arn:aws:organizations::000000000000:root/o-mock/r-abcd", name = "Root", policy_types = [] }]
      master_account_id = "000000000000"
      id                = "o-mockorg123"
    }
  }

  mock_resource "aws_organizations_organizational_unit" {
    defaults = {
      id = "ou-abcd-12345678"
    }
  }

  mock_resource "aws_organizations_account" {
    defaults = {
      id = "111111111111"
    }
  }

  mock_resource "aws_organizations_policy" {
    defaults = {
      id = "p-abcdefgh"
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::123456789012:policy/workload-boundary"
    }
  }

  mock_data "aws_ssoadmin_instances" {
    defaults = {
      arns               = []
      identity_store_ids = []
    }
  }
}

run "baseline_shape" {
  command = plan

  assert {
    condition     = length(aws_organizations_account.this) == 6
    error_message = "six member accounts"
  }

  assert {
    condition = alltrue([
      for a in values(local.accounts) : can(regex("^[\\p{L}\\p{Z}\\p{N}_.:/=+\\-@]*$", a.purpose))
    ])
    error_message = "account tag values use only characters AWS allows (no commas or semicolons)"
  }

  assert {
    condition = alltrue([
      for st in jsondecode(aws_organizations_policy.scp["guardrails"].content).Statement :
      st.Sid != "KeepS3BlockPublicAccess" || (
        st.Effect == "Deny" &&
        jsonencode(try(st.Condition, null)) == jsonencode({ ArnNotLike = { "aws:PrincipalArn" = "arn:aws:iam::*:role/OrganizationAccountAccessRole" } })
      )
    ]) && length([for st in jsondecode(aws_organizations_policy.scp["guardrails"].content).Statement : st if st.Sid == "KeepS3BlockPublicAccess"]) == 1
    error_message = "S3 Block Public Access stays denied to everyone but OrganizationAccountAccessRole"
  }

  assert {
    condition     = length(aws_organizations_policy_attachment.scp) == 15
    error_message = "three SCPs on each of five OUs"
  }

  assert {
    condition     = aws_organizations_account.this["apps"].email == "aws-apps@marisstella.app"
    error_message = "account emails follow the template"
  }

  assert {
    condition     = strcontains(aws_organizations_policy.scp["region-deny"].content, "us-east-1")
    error_message = "region-deny names the allowed region"
  }

  assert {
    condition     = length(aws_ssoadmin_account_assignment.owner) == 0
    error_message = "no Identity Center assignments until the owner's user name is set"
  }

  assert {
    condition     = length(module.boundary) == 0 && output.permissions_boundary_arn == null
    error_message = "organization mode makes no single-account boundary (the SCPs guard the accounts)"
  }

  assert {
    condition     = var.region == "us-east-2" && jsondecode(aws_organizations_policy.scp["region-deny"].content).Statement[0].Condition.StringNotEquals["aws:RequestedRegion"] == ["us-east-2", "us-east-1"]
    error_message = "home region us-east-2; us-east-1 stays open for CloudFront's certificate and WAF"
  }
}

run "resource_control_policies" {
  command = plan

  assert {
    condition     = contains(aws_organizations_organization.this[0].enabled_policy_types, "RESOURCE_CONTROL_POLICY")
    error_message = "RCPs must be enabled on the organization."
  }

  assert {
    condition     = length([for k, a in aws_organizations_policy_attachment.rcp : k if startswith(k, "data-perimeter/")]) == length(aws_organizations_organizational_unit.this)
    error_message = "The data perimeter covers every OU."
  }

  assert {
    condition     = jsondecode(aws_organizations_policy.rcp["data-perimeter"].content).Statement[0].Condition.StringNotEqualsIfExists["aws:PrincipalOrgID"] == "o-mockorg123"
    error_message = "The data perimeter is this organization."
  }

  assert {
    condition     = jsondecode(aws_organizations_policy.rcp["data-perimeter"].content).Statement[0].Condition.BoolIfExists["aws:PrincipalIsAWSService"] == "false"
    error_message = "AWS service principals (CloudFront OAC, CloudTrail, Config) stay allowed."
  }

  assert {
    condition     = keys({ for k, a in aws_organizations_policy_attachment.rcp : k => a if startswith(k, "payments-no-public-repo/") }) == ["payments-no-public-repo/payments"]
    error_message = "The public-repository deny attaches to the Payments OU only."
  }

  assert {
    condition     = jsondecode(aws_organizations_policy.rcp["payments-no-public-repo"].content).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"] == ["repo:Duncan-Haywood/oss-monorepo:*", "repo:Duncan-Haywood@49566815/oss-monorepo@1315497858:*", "repo:*/*@1315497858:*"]
    error_message = "Every token from the public repository is refused in payments."
  }

  assert {
    condition     = alltrue([for p in aws_organizations_policy.rcp : p.type == "RESOURCE_CONTROL_POLICY" && length(p.content) <= 5120])
    error_message = "RCPs are typed and within AWS's 5,120-character limit."
  }
}

# Single-account mode: an account that cannot use AWS Organizations.
run "single_account" {
  command = plan

  variables {
    account_mode = "single"
  }

  assert {
    condition = (
      length(aws_organizations_organization.this) == 0
      && length(aws_organizations_organizational_unit.this) == 0
      && length(aws_organizations_account.this) == 0
      && length(aws_organizations_policy.scp) == 0
      && length(aws_organizations_policy_attachment.scp) == 0
      && length(aws_organizations_policy.rcp) == 0
      && length(aws_organizations_policy_attachment.rcp) == 0
      && length(aws_iam_organizations_features.root_access) == 0
      && length(aws_ssoadmin_permission_set.owner_admin) == 0
    )
    error_message = "single-account mode creates no aws_organizations_* resource, no root-access feature and no Identity Center permission set"
  }

  assert {
    condition     = jsonencode(output.account_ids) == jsonencode({ for k in ["log-archive", "security", "shared-infra", "apps", "payments", "sandbox"] : k => "123456789012" })
    error_message = "every account name maps to the one account, so remote_state readers keep working"
  }

  assert {
    condition     = output.management_account_id == "123456789012" && output.organization_id == null && output.account_mode == "single"
    error_message = "the one account is the management account; there is no organization"
  }

  assert {
    condition     = output.permissions_boundary_arn == "arn:aws:iam::123456789012:policy/workload-boundary"
    error_message = "single-account mode makes the workload boundary"
  }

  assert {
    condition = alltrue([
      for sid in ["DenyIdentityAndOrgChanges", "DenyTouchingCIRolesAndBoundary", "KeepAuditAndDetection", "DenyUnapprovedRegions", "NoCommitments", "KeepManagementState"] :
      contains([for s in module.boundary[0].policy.Statement : s.Sid if s.Effect == "Deny"], sid)
    ])
    error_message = "the boundary carries what the SCPs denied"
  }

  assert {
    condition     = jsonencode([for s in module.boundary[0].policy.Statement : s.NotAction if s.Sid == "DenyUnapprovedRegions"][0]) == jsonencode(local.global_service_actions)
    error_message = "the boundary exempts the same global services as the region-deny SCP"
  }

  assert {
    condition     = contains([for s in module.boundary[0].policy.Statement : s.Resource if s.Sid == "KeepManagementState"][0], "arn:aws:s3:::123456789012-tofu-state-us-east-2/org/*")
    error_message = "no boundaried role may rewrite the management stacks' state"
  }

  assert {
    condition     = length(replace(jsonencode(module.boundary[0].policy), "/\\s/", "")) <= 6144
    error_message = "the boundary fits IAM's 6,144-character managed-policy limit"
  }
}
