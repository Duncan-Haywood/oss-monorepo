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

run "plan_roles_read_only_their_own_state" {
  command = plan

  # ReadOnlyAccess allows every object and every decrypt; only these denies
  # keep pull-request code to its own stack's state (quality round 108).
  assert {
    condition = alltrue(flatten([
      for m in [module.security, module.shared_infra, module.apps, module.payments] : [
        for stack, doc in m.plan_policies : anytrue([
          for s in doc.Statement : s.Effect == "Deny" && contains(flatten([s.Action]), "s3:GetObject") && contains(flatten([try(s.NotResource, [])]), "arn:aws:s3:::${m.state_bucket}/${stack}/*") && !contains(keys(s), "Resource")
        ])
      ]
    ]))
    error_message = "Each plan role denies s3:GetObject everywhere but its own state prefix."
  }

  assert {
    condition = alltrue(flatten([
      for m in [module.security, module.shared_infra, module.apps, module.payments] : [
        for stack, doc in m.plan_policies : alltrue([
          for a in ["kms:Decrypt", "dynamodb:Scan", "sqs:ReceiveMessage", "secretsmanager:GetSecretValue"] :
          contains(flatten([for s in doc.Statement : s.Action if s.Effect == "Deny"]), a)
        ])
      ]
    ]))
    error_message = "Plan roles deny decrypt outside state, data reads and secrets."
  }
}

run "apps_reuses_the_llm_stacks_oidc_provider" {
  command = plan

  assert {
    condition     = module.apps.oidc_provider_arn == "arn:aws:iam::555555555555:oidc-provider/token.actions.githubusercontent.com"
    error_message = "apps trusts the provider stacks/llm created, not a second one."
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

# The IAM names each stack actually creates fall inside its apply role's
# grant (a mismatch is an AccessDenied on the first apply). A pattern p covers
# an ARN when regex("^" + p with * as .* + "$") matches it.
run "apply_roles_cover_the_names_their_stacks_create" {
  command = plan

  # modules/app-paddle-webhook's role_name (private-monorepo infra/aws/payments
  # sets the same): create it with the boundary, then manage it.
  assert {
    condition = alltrue([
      for sid in ["ManageOwnRolesWithinBoundary", "ManageOwnRolesAndPolicies"] : anytrue(flatten([
        for s in module.payments.apply_policies["payments"].Statement : [
          for p in flatten([s.Resource]) : can(regex("^${replace(p, "*", ".*")}$", "arn:aws:iam::666666666666:role/payments-paddle-webhook"))
        ] if s.Sid == sid
      ]))
    ])
    error_message = "The payments apply role can create and manage payments-paddle-webhook."
  }

  # Still tight: no other saas-starter name, no CI role, no other account.
  assert {
    condition = !anytrue(flatten([
      for s in module.payments.apply_policies["payments"].Statement : [
        for p in flatten([s.Resource]) : anytrue([
          for arn in [
            "arn:aws:iam::666666666666:role/saas-starter-hello",
            "arn:aws:iam::666666666666:role/gha-private-monorepo-payments-apply",
            "arn:aws:iam::555555555555:role/payments-paddle-webhook",
          ] : can(regex("^${replace(p, "*", ".*")}$", arn))
        ])
      ] if s.Effect == "Allow" && s.Sid != "ServiceLinkedRoles"
    ]))
    error_message = "The payments grant covers only payments-* in the payments account."
  }

  # One role name per apps stack, as each stack's .tf builds it.
  assert {
    condition = alltrue([
      for pair in [
        ["saas-starter", "saas-starter-hello-scheduler"],
        ["edge-api", "edge-api-function"],
        ["email-ops", "email-ops-function"],
        ["listing-lens", "listing-lens-listing-docs"],
        ["shift-roster", "shift-roster-roster-hub"],
        ["retail-pilot-intel", "retail-pilot-intel-rpi-docs"],
        ["ai-first-markets", "ai-first-markets-ai-first-markets"],
        ] : anytrue(flatten([
          for s in module.apps.apply_policies[pair[0]].Statement : [
            for p in flatten([s.Resource]) : can(regex("^${replace(p, "*", ".*")}$", "arn:aws:iam::555555555555:role/${pair[1]}"))
          ] if s.Sid == "ManageOwnRolesWithinBoundary"
      ]))
    ])
    error_message = "Every apps stack can create the roles it names."
  }

  assert {
    condition = anytrue(flatten([
      for s in module.shared_infra.apply_policies["site"].Statement : [
        for p in flatten([s.Resource]) : can(regex("^${replace(p, "*", ".*")}$", "arn:aws:iam::444444444444:role/site-publish"))
      ] if s.Sid == "ManageOwnRolesWithinBoundary"
    ]))
    error_message = "The site apply role can create site-publish."
  }

  # The product stacks read saas-starter's state, email-ops reads edge-api's.
  assert {
    condition = alltrue([
      for stack in ["listing-lens", "email-ops"] : length(setsubtract(
        ["arn:aws:s3:::555555555555-tofu-state-us-east-1/saas-starter/terraform.tfstate", "arn:aws:s3:::555555555555-tofu-state-us-east-1/edge-api/terraform.tfstate"],
        flatten([for s in module.apps.apply_policies[stack].Statement : flatten([s.Resource]) if s.Sid == "ReadOwnAndSharedState"])
      )) == 0
    ])
    error_message = "apps stacks can read the saas-starter and edge-api state they depend on."
  }
}

run "iam_prefixes_must_name_their_stack" {
  command = plan

  variables {
    stacks = {
      payments = { account = "payments", repo = "private-monorepo", managed_policies = [], iam_prefixes = ["saas-starter"] }
    }
  }

  expect_failures = [var.stacks]
}
