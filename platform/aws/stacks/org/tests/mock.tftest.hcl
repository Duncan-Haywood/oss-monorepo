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
}

run "resource_control_policies" {
  command = plan

  assert {
    condition     = contains(aws_organizations_organization.this.enabled_policy_types, "RESOURCE_CONTROL_POLICY")
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
    condition     = jsondecode(aws_organizations_policy.rcp["payments-no-public-repo"].content).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"][0] == "repo:Duncan-Haywood/oss-monorepo:*"
    error_message = "Every token from the public repository is refused in payments."
  }

  assert {
    condition     = alltrue([for p in aws_organizations_policy.rcp : p.type == "RESOURCE_CONTROL_POLICY" && length(p.content) <= 5120])
    error_message = "RCPs are typed and within AWS's 5,120-character limit."
  }
}
