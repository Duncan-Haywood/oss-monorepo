---
title: "What an AWS spend kill switch should not stop"
date: 2026-11-25
tags: [aws, opentofu, cost, security, infrastructure]
description: "AWS has no account-wide spending cap, so we built one. The hard part was deciding what it must leave running: the site, payments and the audit trail."
---

The portfolio is moving from Cloudflare to AWS
([the decision](../reports/2026-11-24-cloud-provider-comparison.md)). On
Cloudflare a spending limit is a setting. AWS has no cap for a whole
account. A budget emails you when you cross it, and the bill keeps growing.
AWS has started offering a per-project spend limit to some new accounts,
but only in the console, with no API we could find, and only per project.
A leaked key running GPU instances overnight would not care about either.

So [`stacks/spend`](../../platform/aws/stacks/spend/) builds the cap from
parts AWS does provide. When an account crosses its monthly budget, AWS
Budgets attaches a policy that stops anything new from starting, and a
Lambda stops what is already running. This week's follow-up added a faster
signal in front of the budgets, and a rule about what the switch may touch.

## The fast signal

Budget data lags actual usage by hours, so a monthly budget is a backstop,
not a fuse. Cost Anomaly Detection compares each day with that service's
or account's usual spend, so a runaway loop shows up the same day. It now
alerts above $10 of anomaly impact, and the budgets alert at 50% as well as
80%, before anything has to stop.

## The rule: a kill switch must not cause the outage it prevents

The first version sent every account's hard-line notification to the kill
switch. Seven accounts, seven sets of things to stop. Two of those accounts
were the wrong ones to stop:

- **`shared-infra`** holds the site, DNS and the edge API. Stopping its
  Lambdas takes the public surface down. That is a bigger loss than a
  month's overrun on a static site.
- **`payments`** runs the receiver for Paddle's webhooks. Throttle it and
  paid subscriptions stop being recorded, which is the opposite of saving
  money.

`log-archive` and `security` hold the audit trail, and the management
account runs the switch itself.

So now only `kill_switch_accounts` (by default `apps` and `sandbox`) wake the
switch. The others still get the alerts and still get the policy that
blocks new spending. Nothing new starts there, but nothing already serving
stops. The function checks the same list itself, so a misrouted
notification cannot stop an alert-only account. A person can still stop
any account by invoking the switch directly.

The same rule shaped the rest:

- **Nothing is deleted.** A unit test reads the handler's source and fails
  if a call like `terminate_instances`, `delete_db_` or
  `delete_event_source_mapping` appears. SageMaker endpoints and spot
  instances can only be stopped by deleting them, so the switch reports
  them in its log and a person decides.
- **Queues keep their messages.** Disabling a Lambda's event source mapping
  stops the function being fed. The messages wait in the queue for resume.
- **Storage, logs, audit, DNS and keys are never named.** A test fails if
  the freeze policy ever lists an S3, CloudWatch Logs, CloudTrail, Route 53,
  domain, KMS, DynamoDB, Secrets Manager, GuardDuty, Security Hub or Config
  action.
- **Untagged resources are in scope.** A crypto miner started with a leaked
  key carries no tags, and it is the main thing the switch exists to stop.

## What else the follow-up covers

The switch now sweeps both regions the organisation allows, not just the
home region. Two of the cheapest ways to run up a bill otherwise survive:
an Auto Scaling group replaces the instances you stop, and a spot fleet in
`us-west-2` is never looked at. Groups now go to 0/0/0, Aurora clusters
stop, and the freeze policy denies scaling them back up. Each change is
tagged with what it replaced, so `resume` restores the exact sizes.

The owner's alert address had been an ordinary variable, which would have
printed it in this public repository's CI logs. It is now marked sensitive.

## Tested, and not

There are 17 unit tests with fake AWS clients and no network. Six `tofu
test` runs plan the stack against a mocked provider. While writing them we
found that one of our own assertions could never fail. Both mocked SNS
topics had the same ARN, so "this budget notifies only one topic" was always
true. With distinct mock ARNs, putting `payments` on the kill list now fails
it, as it should.

What no mock can show is AWS's own timing. AWS also restarts a stopped RDS
database after seven days, which no policy can prevent. The runbook says to
run the stop again weekly while an account stays over. None of it is
applied yet: the account comes first, and the owner's steps are in
[one checklist](../runbooks/aws-cutover.md).
