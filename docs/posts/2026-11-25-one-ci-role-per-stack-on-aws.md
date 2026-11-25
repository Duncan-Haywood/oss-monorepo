---
title: "One CI role per stack: keeping a public repository's Actions out of the payments account"
seo_title: "Per-stack GitHub OIDC roles on AWS, tested with mocks"
date: 2026-11-25
tags: [aws, opentofu, security, platform]
description: "Each AWS stack gets its own GitHub OIDC plan and apply roles in its own account. The payments account trusts only the private repository."
---

The repository's AWS foundation is written as OpenTofu but not yet applied.
In it, the management account holds two CI roles, a read-only one for pull
requests and an administrator for `main`. That fits the organization-level
stacks, since an Organization cannot be built with less. But the stacks
coming next (DNS, the site, the edge API, the SaaS starter, the products,
payments) would then all deploy through that one administrator.

`platform/aws/stacks/github-oidc` gives each of them its own pair instead:

- `gha-<repo>-<stack>-plan` trusts exactly
  `repo:Duncan-Haywood/<repo>:pull_request`. It can read configuration and
  its own state, and nothing that holds data or secrets.
- `gha-<repo>-<stack>-apply` trusts exactly
  `repo:Duncan-Haywood/<repo>:environment:aws-prod`. It writes only its own
  state key, and it can manage only IAM roles and policies named after its
  stack. Every role it creates must carry a permissions boundary that rules
  out users, access keys, identity providers, Organizations calls and changes
  to the CI roles themselves.
- Each workload account gets its own state bucket, which refuses principals
  from any other account.

**Payments** is the case that matters most. It is applied from the private
repository, so every role in the payments account trusts only
`private-monorepo`. A variable validation refuses any other repository for
that account. A test checks every payments trust policy, and checks that the
payments state lives in the payments account. One limit remains: the
management account can still reach every member account. That is how AWS
Organizations works, and it is why the management roles' trust is pinned
to `main`.

A second stack, `stacks/findings`, sends high and critical Security Hub
findings to a queue in the security account. A scheduled job turns them into
Markdown files next to the code-scanning alerts, so agents read them the same
way.

## Two things a mocked provider teaches

`tofu test` with `mock_provider "aws"` checked all of this without an AWS
account:

1. **Mocks still meet the provider's validators.** OpenTofu fills computed
   attributes with random strings, even at plan time, and the AWS provider
   rejects them as ARNs, UUIDs or organization IDs. Per-type defaults fix
   that for every resource of the type:
   `mock_resource "aws_iam_role" { defaults = { arn = "arn:aws:iam::..." } }`.
2. **Write policies with `jsonencode`.** Under a mock,
   `aws_iam_policy_document` returns a random string. A `jsonencode`d policy
   is evaluated by OpenTofu itself, so the tests can decode it and check
   every statement and trust subject.

Nothing has been applied, and nothing costs anything until the owner opens
the AWS account.
