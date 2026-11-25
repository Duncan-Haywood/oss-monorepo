---
title: "AWS has no account-wide spending cap, so we built one in four layers"
date: 2026-11-24
tags: [aws, opentofu, cost, security, infrastructure]
description: "AWS budgets alert but do not stop spend. How we layered anomaly detection, a deny SCP and a tested kill switch to cap each account."
---

The portfolio is moving from Cloudflare to AWS
([the decision](../reports/2026-11-24-cloud-provider-comparison.md)). On
Cloudflare a spending limit is a setting. AWS has nothing like it for a
whole account. A budget emails you when you cross it and then lets the
bill keep growing. AWS has started offering a per-project spend limit
to some new accounts, but only in the console and only per project. A
leaked access key running GPU instances overnight would not care about
either.

So before any workload lands, the
[spend-guards stack](../../platform/aws/spend-guards/) builds the cap out
of parts AWS does provide. It runs in four layers, per account:

1. **Anomaly detection** emails the same day a service or account costs
   noticeably more than usual. This is the fast signal, days ahead of a
   monthly budget.
2. **Budget alerts** at 50, 80 and 100 % of each account's monthly budget,
   plus one when the forecast passes 100 %.
3. **At the hard line, AWS Budgets itself attaches a service control
   policy** to the offending account. The SCP denies the calls that start
   or grow spend: new instances, ECS service changes, Lambda code, new or
   restarted databases, SageMaker, Bedrock model calls, SES sending, savings
   plans. No code of ours has to run for this layer to work.
4. **A kill-switch Lambda stops what is already running.** It stops EC2
   and RDS, scales Auto Scaling groups and ECS services to zero, sets
   Lambda concurrency to zero, and disables queue triggers. It writes each
   resource's previous size into a tag first, so `resume` restores exactly
   what was there.

## What we chose not to stop

A guard that takes the business down is its own incident, so the design
is mostly about what keeps running.

- **Nothing is deleted.** The unit tests scan the function's source for
  `terminate_instances`, `delete_db` and the like, and fail if one shows up.
  SageMaker endpoints and spot instances can only be stopped by deleting
  them, so the switch reports them and a person decides.
- **Logs, state and DNS are never touched.** A test fails if the SCP ever
  names an S3, CloudWatch Logs, CloudTrail, Route 53, KMS or IAM action.
- **The site and payments stay up.** The account that holds DNS and the
  site gets the deny SCP but no kill switch. The payments account is
  alerts-only, so Paddle webhooks keep being recorded.
- **Untagged resources are in scope.** A crypto miner started with a
  leaked key carries no tags, and it is the main thing the switch exists
  to stop. Tagging `spend_guard = keep` is the only way to opt out.
- **Domain renewal is never denied.** The first draft listed it with
  domain registration as "new spend". We took it out on review, and a test
  now fails if it comes back. A lapsed domain costs more than any overrun.

## What is tested, and what is not

The OpenTofu has 20 `tofu test` runs against mocked providers. They check
the security properties: no wildcard IAM actions, every mutation scoped to
the account's own ARNs, the kill-switch role trusted by one principal only,
everything encrypted with a rotating key, and the topic accepting only AWS
Budgets over TLS. The Lambda has 36 unit tests with fake AWS clients and no
network. Checkov passes with two documented skips: a VPC for the Lambda
would cost more than the overruns it guards against, and code signing
waits for the organization's Signer profile.

What no mock can show is AWS's own timing. Budget data lags actual usage by
hours, so the hard line is a backstop, not a fuse. Anomaly detection and
WAF rate limits are the faster layers. AWS also restarts a stopped RDS
database after seven days, which no SCP can prevent, so the runbook says to
re-run the stop weekly while an account is tripped.

None of this is applied yet: there is no AWS account. The owner's part is
ten steps, in [one runbook](../../platform/aws/OWNER_RUNBOOK.md), about 90
minutes of clicks before CI can apply everything else.
