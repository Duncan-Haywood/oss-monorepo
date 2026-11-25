# `tofu test` with a mocked AWS provider: no credentials, no AWS calls.
# Checks the plan's shape, not AWS's acceptance of it.

mock_provider "aws" {
  mock_resource "aws_organizations_organization" {
    defaults = {
      roots             = [{ id = "r-abcd", arn = "arn:aws:organizations::000000000000:root/o-mock/r-abcd", name = "Root", policy_types = [] }]
      master_account_id = "000000000000"
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
