# Who can assume what, checked against mocked providers.

mock_provider "aws" {
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
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
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}
mock_provider "aws" {
  alias = "security"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
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
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}
mock_provider "aws" {
  alias = "shared_infra"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
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
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}
mock_provider "aws" {
  alias = "apps"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
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
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}
mock_provider "aws" {
  alias = "payments"
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555", key_id = "11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock-queue", id = "https://sqs.us-east-1.amazonaws.com/111111111111/mock-queue" }
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
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:111111111111:rule/mock-rule" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_securityhub_configuration_policy" {
    defaults = { id = "11111111-2222-3333-4444-555555555555", arn = "arn:aws:securityhub:us-east-1:111111111111:configuration-policy/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudtrail" {
    defaults = { arn = "arn:aws:cloudtrail:us-east-1:111111111111:trail/mock" }
  }
  mock_resource "aws_accessanalyzer_analyzer" {
    defaults = { arn = "arn:aws:access-analyzer:us-east-1:111111111111:analyzer/mock" }
  }
}

variables {
  account_ids = {
    management   = "111111111111"
    log-archive  = "222222222222"
    security     = "333333333333"
    shared-infra = "444444444444"
    apps         = "555555555555"
    payments     = "666666666666"
    sandbox      = "777777777777"
  }
  state_bucket_arn   = "arn:aws:s3:::oss-monorepo-tfstate-111111111111-us-east-1"
  state_kms_key_arn  = "arn:aws:kms:us-east-1:111111111111:key/11111111-2222-3333-4444-555555555555"
  findings_queue_arn = "arn:aws:sqs:us-east-1:333333333333:oss-monorepo-security-findings"
  clients_ou_path    = "o-exampleorg1/r-root/ou-root-clients1/"
}

run "trust_is_scoped_to_repo_event_and_environment" {
  command = plan

  assert {
    condition = alltrue(flatten([
      for m in [module.management, module.security, module.shared_infra, module.apps, module.payments] : [
        for role, sub in m.trust_subjects :
        endswith(role, "-plan") ? endswith(sub, ":pull_request") : endswith(role, "-apply") ? endswith(sub, ":environment:aws-prod") : sub == "repo:Duncan-Haywood/oss-monorepo:ref:refs/heads/main"
      ]
    ]))
    error_message = "Plan roles trust pull requests, apply roles the aws-prod environment, the findings reader main only."
  }

  assert {
    condition = alltrue(flatten([
      for m in [module.management, module.security, module.shared_infra, module.apps, module.payments] : [
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
      for m in [module.management, module.security, module.shared_infra, module.apps] : [
        for sub in values(m.trust_subjects) : !strcontains(sub, "private-monorepo")
      ]
    ]))
    error_message = "The private repository has no roles outside payments."
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

  # Roles a stack creates must carry the boundary.
  assert {
    condition = alltrue([
      for stack, doc in module.apps.apply_policies :
      anytrue([for s in doc.Statement : contains(flatten([s.Action]), "iam:CreateRole") && try(s.Condition.StringEquals["iam:PermissionsBoundary"], "") == "arn:aws:iam::555555555555:policy/workload-boundary"])
    ])
    error_message = "CreateRole is allowed only with the workload boundary."
  }

  # IAM writes only on the stack's own name prefix.
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
        for s in doc.Statement : alltrue([for r in flatten([s.Resource]) : strcontains(r, "/stacks/${stack}/")])
        if s.Sid == "WriteOwnState"
      ]
    ]))
    error_message = "A stack writes only its own state."
  }
}

run "client_accounts_enter_only_clients" {
  command = plan

  assert {
    condition = anytrue([
      for s in module.management.apply_policies["client-accounts"].Statement :
      s.Sid == "EnterClientAccountsOnly" && s.Condition["ForAnyValue:StringLike"]["aws:ResourceOrgPaths"][0] == "o-exampleorg1/r-root/ou-root-clients1/*"
    ])
    error_message = "client-accounts may assume roles only in the Clients OU."
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
