# `tofu test` with a mocked AWS provider: no credentials, no AWS calls.
# Checks the plan's shape, not AWS's acceptance of it.

variables {
  state_bucket = "000000000000-tofu-state-us-east-1"
}

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_data "aws_organizations_organization" {
    defaults = {
      roots = [{ id = "r-abcd", arn = "arn:aws:organizations::000000000000:root/o-abcdefghij/r-abcd", name = "Root", policy_types = [] }]
    }
  }

  mock_resource "aws_organizations_policy" {
    defaults = {
      id = "p-abcdefgh"
    }
  }

  mock_resource "aws_sesv2_email_identity" {
    defaults = {
      arn = "arn:aws:ses:us-east-1:000000000000:identity/mock"
    }
  }

  mock_data "aws_sesv2_email_identity" {
    defaults = {
      dkim_signing_attributes = [{
        current_signing_key_length    = "RSA_2048_BIT"
        domain_signing_private_key    = ""
        domain_signing_selector       = ""
        last_key_generation_timestamp = ""
        next_signing_key_length       = "RSA_2048_BIT"
        signing_attributes_origin     = "AWS_SES"
        status                        = "PENDING"
        tokens                        = ["tok1", "tok2", "tok3"]
      }]
    }
  }

  mock_resource "aws_securityhub_configuration_policy" {
    defaults = {
      id = "00000000-0000-0000-0000-000000000000"
    }
  }

  mock_resource "aws_kms_key" {
    defaults = {
      arn = "arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000000"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::000000000000:role/mock"
    }
  }

  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::000000000000:policy/mock"
    }
  }

  mock_resource "aws_iam_user" {
    defaults = {
      arn = "arn:aws:iam::000000000000:user/mock"
    }
  }

  mock_resource "aws_iam_service_linked_role" {
    defaults = {
      arn = "arn:aws:iam::000000000000:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::000000000000:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:us-east-1:000000000000:mock"
    }
  }

  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:000000000000:mock"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:us-east-1:000000000000:function:mock"
    }
  }

  mock_resource "aws_secretsmanager_secret" {
    defaults = {
      arn = "arn:aws:secretsmanager:us-east-1:000000000000:secret:mock"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:000000000000:log-group:mock"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::mock"
    }
  }
}

override_data {
  target = data.terraform_remote_state.org
  values = {
    outputs = {
      organization_id       = "o-abcdefghij"
      management_account_id = "000000000000"
      region                = "us-east-1"
      ou_ids                = {}
      account_ids = {
        log-archive  = "111111111111"
        security     = "222222222222"
        shared-infra = "333333333333"
        apps         = "444444444444"
        payments     = "555555555555"
        sandbox      = "666666666666"
      }
    }
  }
}

run "any_workspace_in_the_apps_account" {
  command = plan

  assert {
    condition     = length(local.workspace_arns) == 1 && local.workspace_arns[0] == "arn:aws:aws-external-anthropic:us-east-2:444444444444:workspace/*"
    error_message = "defaults to every workspace of the apps account in the region"
  }
}

run "ci_trust_accepts_both_subject_forms" {
  command = plan

  assert {
    condition = sort(flatten([for c in one(data.aws_iam_policy_document.ci_trust.statement).condition : tolist(c.values) if c.variable == "token.actions.githubusercontent.com:sub"])) == sort([
      "repo:Duncan-Haywood/oss-monorepo:ref:refs/heads/main",
      "repo:Duncan-Haywood/oss-monorepo:environment:aws-llm",
      "repo:Duncan-Haywood@49566815/oss-monorepo@1315497858:ref:refs/heads/main",
      "repo:Duncan-Haywood@49566815/oss-monorepo@1315497858:environment:aws-llm",
    ])
    error_message = "The CI LLM role trusts main and aws-llm of this repository, in both subject forms, and nothing else."
  }
}

run "one_workspace" {
  command = plan
  variables {
    workspace_ids = ["wrkspc_01AbCdEf23GhIj"]
  }

  assert {
    condition     = length(local.workspace_arns) == 1 && local.workspace_arns[0] == "arn:aws:aws-external-anthropic:us-east-2:444444444444:workspace/wrkspc_01AbCdEf23GhIj"
    error_message = "scopes to the named workspace"
  }

  assert {
    condition     = aws_iam_role.app_llm.tags["spend-guard"] == "deny-on-budget"
    error_message = "the kill switch can cut the app role"
  }
}

run "rejects_bad_workspace_id" {
  command = plan
  variables {
    workspace_ids = ["not-a-workspace"]
  }
  expect_failures = [var.workspace_ids]
}

# Single-account mode: no member account, the bootstrap's OIDC provider, and
# stacks/org's boundary on both roles.
run "single_account" {
  command = plan

  variables {
    account_mode = "single"
  }

  override_data {
    target = data.terraform_remote_state.org
    values = {
      outputs = {
        organization_id          = null
        management_account_id    = "444444444444"
        account_ids              = { for k in ["log-archive", "security", "shared-infra", "apps", "payments", "sandbox"] : k => "444444444444" }
        permissions_boundary_arn = "arn:aws:iam::444444444444:policy/workload-boundary"
      }
    }
  }

  override_data {
    target = data.aws_iam_openid_connect_provider.bootstrap[0]
    values = { arn = "arn:aws:iam::444444444444:oidc-provider/token.actions.githubusercontent.com" }
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0 && local.github_oidc_arn == "arn:aws:iam::444444444444:oidc-provider/token.actions.githubusercontent.com"
    error_message = "single-account mode reuses the bootstrap's OIDC provider"
  }

  assert {
    condition     = aws_iam_role.ci_llm.path == "/ci/"
    error_message = "the CI role stays out of /github/, which the bootstrap closes to github-apply"
  }

  assert {
    condition = alltrue([
      for r in [aws_iam_role.app_llm, aws_iam_role.ci_llm] : r.permissions_boundary == "arn:aws:iam::444444444444:policy/workload-boundary"
    ])
    error_message = "every role carries the workload boundary"
  }
}

run "organization_mode_unchanged" {
  command = plan

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1 && aws_iam_role.ci_llm.path == "/github/" && aws_iam_role.app_llm.permissions_boundary == null
    error_message = "organization mode keeps its own provider, /github/ and no boundary"
  }
}
