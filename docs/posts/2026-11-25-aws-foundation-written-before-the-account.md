---
title: "An AWS organization written and tested before the account exists"
seo_title: "AWS org baseline in OpenTofu, tested with mocks"
date: 2026-11-25
tags: [aws, opentofu, security, platform]
description: "Seven accounts, guardrails, security services and keyless CI roles as OpenTofu, tested against a mocked provider before any AWS account exists."
---

On 2026-11-24 the owner decided to move the whole platform onto AWS, security
first. AWS will not let anyone but a person open the first account. So the
foundation went into code before that day: everything under
[`platform/aws/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/platform/aws)
is written so that, once the account exists, CI can apply it.

## What is there

- **A state bucket** for every stack. It is KMS-encrypted, versioned and
  object-locked, refuses plain HTTP, and gives each CI role exactly one
  prefix.
- **Seven accounts in an organization**: management, log-archive, security,
  shared-infra, apps, payments and sandbox, plus an OU for client projects.
  Member accounts have no root password at all.
- **Guardrails** as service control policies. Nobody in a member account can
  switch off CloudTrail, GuardDuty, Config, Security Hub or Access Analyzer,
  use a region other than us-east-1 or us-west-2, act as root, or create an
  access key. A resource control policy keeps S3, KMS, Secrets Manager and
  SQS inside the organization.
- **Security services everywhere**: an organization trail into a write-once
  bucket, GuardDuty and Access Analyzer in both regions, and Security Hub
  running the AWS Foundational Security Best Practices and CIS benchmarks in
  every account. High and critical findings go to a queue that a scheduled job
  turns into files, next to the code-scanning alerts.
- **CI identities without keys.** Each stack gets a read-only plan role for
  pull requests and an apply role reachable only from the protected
  environment on `main`. Roles that workloads create carry a permissions
  boundary. The payments account trusts only the private repository: a
  validation, a test and a resource control policy each enforce that
  separately.

The owner does three things by hand: open the account (with root MFA and a
card), launch one CloudFormation template that creates the first CI
identity, and enable Identity Center. Everything after that is a merge.

## Testing infrastructure that does not exist yet

`tofu test` with `mock_provider "aws"` plans every stack against a fake
provider, and the assertions check the parts that matter for security: no
public access, encryption on, every trust policy naming one repository and
one event, every IAM write scoped to the stack's own name prefix. Two
lessons from getting those tests green:

1. **Write policies with `jsonencode`, not `aws_iam_policy_document`.** The
   data source is computed by the provider, so under a mock it returns a
   random string and there is nothing to assert on. A `jsonencode`d local is
   evaluated by OpenTofu itself, so a test can decode it and check every
   statement.
2. **Mocks still meet the provider's validators.** OpenTofu fills computed
   attributes with random strings even at plan time, and the AWS provider
   then rejects them as ARNs, UUIDs or organization IDs. Per-type defaults
   (`mock_resource "aws_kms_key" { defaults = { arn = "arn:aws:kms:..." } }`)
   fix that once for every resource of that type.

Checkov runs over the same tree. Each finding was either fixed or skipped
inline with its reason. Most skips are the permissions boundary, whose
`Allow *` is the ceiling it imposes, not a grant.

Nothing here has been applied, and nothing costs anything until the owner
opens the account.
