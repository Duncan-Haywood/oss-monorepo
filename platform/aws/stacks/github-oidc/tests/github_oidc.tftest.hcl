# Who can assume what, and where state lives, against mocked providers.
# `tofu test` from this directory; no credentials, no AWS calls.

mock_provider "aws" {
  alias = "security"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  override_data {
    target = module.security.data.aws_caller_identity.current
    values = { account_id = "333333333333" }
  }
}
mock_provider "aws" {
  alias = "shared_infra"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  override_data {
    target = module.shared_infra.data.aws_caller_identity.current
    values = { account_id = "444444444444" }
  }
}
mock_provider "aws" {
  alias = "apps"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  override_data {
    target = module.apps.data.aws_caller_identity.current
    values = { account_id = "555555555555" }
  }
}
mock_provider "aws" {
  alias = "payments"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock-role" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/mock-policy" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  override_data {
    target = module.payments.data.aws_caller_identity.current
    values = { account_id = "666666666666" }
  }
}

variables {
  account_ids = {
    log-archive  = "222222222222"
    security     = "333333333333"
    shared-infra = "444444444444"
    apps         = "555555555555"
    payments     = "666666666666"
    sandbox      = "777777777777"
  }
}

run "trust_is_scoped_to_repo_event_and_environment" {
  command = plan

  assert {
    condition = alltrue(flatten([
      for m in [module.security, module.shared_infra, module.apps, module.payments] : [
        for role, sub in m.trust_subjects :
        endswith(role, "-plan") ? endswith(sub, ":pull_request") : endswith(role, "-apply") ? endswith(sub, ":environment:aws-prod") : sub == "repo:Duncan-Haywood/oss-monorepo:ref:refs/heads/main"
      ]
    ]))
    error_message = "Plan roles trust pull requests, apply roles the aws-prod environment, the findings reader main only."
  }

  assert {
    condition = alltrue(flatten([
      for m in [module.security, module.shared_infra, module.apps, module.payments] : [
        for sub in values(m.trust_subjects) : !strcontains(sub, "*")
      ]
    ]))
    error_message = "No wildcard subjects."
  }
}

run "payments_is_private_repo_only" {
  command = plan

  assert {
    condition     = length(module.payments.trust_subjects) > 0 && alltrue([for sub in values(module.payments.trust_subjects) : startswith(sub, "repo:Duncan-Haywood/private-monorepo:")])
    error_message = "Every role in the payments account trusts only the private repository."
  }

  assert {
    condition = alltrue(flatten([
      for m in [module.security, module.shared_infra, module.apps] : [
        for sub in values(m.trust_subjects) : !strcontains(sub, "private-monorepo")
      ]
    ]))
    error_message = "The private repository has no roles outside payments."
  }

  assert {
    condition     = output.state_buckets["payments"] == "666666666666-tofu-state-us-east-1"
    error_message = "Payments state lives in the payments account."
  }
}

run "roles_cannot_escape_their_boundary" {
  command = plan

  assert {
    condition = alltrue([
      for a in ["iam:CreateUser", "iam:CreateAccessKey", "organizations:*"] :
      contains(flatten([for s in module.apps.boundary_policy.Statement : s.Action if s.Effect == "Deny"]), a)
    ])
    error_message = "The boundary denies users, keys and organization changes."
  }

  assert {
    condition = alltrue([
      for stack, doc in module.apps.apply_policies :
      anytrue([for s in doc.Statement : contains(flatten([s.Action]), "iam:CreateRole") && try(s.Condition.StringEquals["iam:PermissionsBoundary"], "") == "arn:aws:iam::555555555555:policy/workload-boundary"])
    ])
    error_message = "CreateRole is allowed only with the workload boundary."
  }

  assert {
    condition = alltrue(flatten([
      for stack, doc in module.apps.apply_policies : [
        for s in doc.Statement : alltrue([for r in flatten([s.Resource]) : strcontains(r, ":role/${stack}-") || strcontains(r, ":role/service-role/${stack}-") || strcontains(r, ":policy/${stack}-")])
        if s.Sid == "ManageOwnRolesAndPolicies"
      ]
    ]))
    error_message = "IAM management is limited to the stack's own roles and policies."
  }

  assert {
    condition = alltrue(flatten([
      for stack, doc in module.apps.apply_policies : [
        for s in doc.Statement : alltrue([for r in flatten([s.Resource]) : endswith(r, "-tofu-state-us-east-1/${stack}/*")])
        if s.Sid == "WriteOwnState"
      ]
    ]))
    error_message = "A stack writes only its own state."
  }
}

run "public_repo_cannot_target_payments" {
  command = plan

  variables {
    stacks = {
      payments = { account = "payments", repo = "oss-monorepo", managed_policies = [] }
    }
  }

  expect_failures = [var.stacks]
}
