# stacks/spend: budgets, the spend freeze and the kill switch

Task `aws-spend-guards` (`portfolio/work/tasks.yaml`). Applied in the
management account by `.github/workflows/priv-aws-apply.yml`.

## The layers

| When (per account, monthly, actual cost) | What happens | Made by |
|---|---|---|
| any day a service or account costs unusually much (≥ `anomaly_threshold_usd`, default $10) | alert on the `budget-alerts` topic | `anomaly.tf` |
| 50% of the account's budget | alert on the `budget-alerts` SNS topic (and email, if `AWS_BUDGET_ALERT_EMAIL` is set) | `aws_budgets_budget.account` |
| 80% of the account's budget | alert on the `budget-alerts` SNS topic (and email, if `AWS_BUDGET_ALERT_EMAIL` is set) | `aws_budgets_budget.account` |
| forecast passes 100% | alert | same |
| `freeze_at_percent` (default 100%) | AWS Budgets attaches the `spend-freeze` SCP to the account: nothing new starts | `aws_budgets_budget_action.freeze` |
| same moment, **only for `kill_switch_accounts`** (default `apps`, `sandbox`) | the `budget-kill` topic invokes the kill switch, which stops what is running | `kill_switch/handler.py` |
| organisation passes 50% of `organization_limit_usd` | alert only | `aws_budgets_budget.organization` |
| organisation passes 80% / forecast 100% of `organization_limit_usd` | alert only | `aws_budgets_budget.organization` |

Anomaly detection is the fast layer: it compares each day with the usual, so
a runaway loop or a leaked key shows up the same day, not when a monthly
budget crosses a line. If the first apply fails on
`aws_ce_anomaly_monitor.services` because AWS made a default services monitor
at sign-up (one is allowed per account), import it:
`import { to = aws_ce_anomaly_monitor.services[0], id = "<its ARN>" }`.

The limits in `variables.tf` are starting dials for an empty organisation,
not quotes of any price. Raise one in a pull request when a product's real
usage needs it.

AWS Budgets works from billing data that lags by hours, and the provider has
no hard spending-cap resource (none in `hashicorp/aws` 6.72.0's schema), so
spending can overshoot a limit before anything acts. The limits are therefore
set below what the owner can afford to lose. AWS has started offering a
per-project monthly spend limit to some accounts created through its "new AWS
experience" (limited rollout since September 2026, set in the Billing
console, no API found). It covers a project, not an account, so this stack
does not depend on it; setting one if the console offers it is an owner
step in `docs/runbooks/aws-cutover.md`. Claude Platform on AWS has its
own monthly spend limits, set in the Claude Console (Admin role), and a
tier cap after which requests fail with HTTP 429 (platform.claude.com,
"Claude Platform on AWS", Billing, read 2026-11-24): set a workspace limit
there too (runbook, phase 2).

## What the freeze SCP stops

New EC2 instances and starts, NAT gateways, ECS services and tasks, new
Lambda functions (and removing a function's zero concurrency), new or
restarted RDS instances and clusters, SageMaker endpoints and training,
Bedrock invocations, Claude Platform on AWS inference and batches, and SES
sending. `OrganizationAccountAccessRole` (CI) and roles under `/spend-guard/`
are exempt, so CI can still fix things and the kill switch can still act.

## Which accounts the kill switch stops

A budget notification stops only the accounts in `kill_switch_accounts`
(default `apps` and `sandbox`). The others get the alerts and the freeze SCP,
but what already runs keeps running:

| Account | Why it is alert-only by default |
|---|---|
| `shared-infra` | holds the site, DNS and the edge API: stopping it takes the public surface down |
| `payments` | the Paddle webhook receiver must keep recording payments |
| `log-archive`, `security` | the audit trail and security tooling must never be stopped by spend |
| `management` | runs the kill switch itself; SCPs never bind it |

The function checks this too (`KILL_ON_BUDGET`), so a misrouted notification
cannot stop an alert-only account. A direct invocation (below) can still
stop any account, for when a person decides it should.

## What the kill switch stops

In the account whose budget fired, in every region in `kill_switch_regions`
(default `us-east-1` and `us-west-2`, the regions the org SCP allows):

- **IAM:** a deny policy (`spend-guard-deny`: Claude Platform on AWS, Bedrock,
  SES sending) on every role and user tagged `spend-guard=deny-on-budget`
  (`app-llm`, `github-llm-gate`, `transitional-worker`).
- **SES:** account sending paused.
- **Lambda:** reserved concurrency set to 0 (the function and its code stay),
  and event source mappings disabled (queues and streams keep their messages).
- **ECS:** services scaled to 0 tasks.
- **Auto Scaling:** groups set to min = max = desired = 0.
- **EC2:** running instances stopped. Spot instances can only be terminated,
  so they are **reported** in the log (`REPORT ...`), not stopped.
- **RDS:** available DB instances and Aurora clusters stopped. AWS starts a
  stopped database again after 7 days; while an account stays over, run the
  kill by hand weekly (below).
- **SageMaker:** endpoints in service are **reported**; stopping one means
  deleting it, which needs a person.

Untagged resources are in scope on purpose: a leaked key's crypto miner
carries no tags. Anything tagged `spend-guard=exempt` is skipped, and the
switch never throttles itself. It never deletes or terminates anything (a
unit test checks the source for those calls).

## What keeps running

The alert-only accounts above, entirely. In a stopped account, everything
that bills little or nothing while idle and holds data or reachability: S3 buckets and objects, DynamoDB tables, SQS queues, SNS
topics, KMS keys, Secrets Manager, Route 53 and CloudFront, CloudTrail,
GuardDuty, Security Hub and Config (the security baseline must never be
switched off by spend). Nothing is deleted.

## Dry run first

The stack ships with `kill_switch_dry_run = true`: the function logs what it
would do and changes nothing. After the first apply, invoke it by hand and
read the log:

```sh
aws lambda invoke --function-name spend-kill-switch \
  --payload '{"action":"kill","account":"sandbox"}' --cli-binary-format raw-in-base64-out out.json
cat out.json
```

Then set the repository variable `AWS_KILL_SWITCH_LIVE=true`; the next apply
turns it live.

## Resume

1. Raise the budget (a PR changing `monthly_limits_usd`) or wait for the
   next month.
2. Lift the freeze by reversing the budget action, so Budgets knows it was
   undone (management account):

   ```sh
   aws budgets describe-budget-actions-for-budget --account-id <mgmt id> --budget-name monthly-apps
   aws budgets execute-budget-action --account-id <mgmt id> --budget-name monthly-apps \
     --action-id <ActionId> --execution-type REVERSE_BUDGET_ACTION
   ```

   If that fails, detach it directly:
   `aws organizations detach-policy --policy-id <freeze_policy_id output> --target-id <account id>`.
3. Put back what the kill switch stopped:

```sh
aws lambda invoke --function-name spend-kill-switch \
  --payload '{"action":"resume","account":"apps"}' --cli-binary-format raw-in-base64-out out.json
```

`resume` starts only what the switch stopped (it tagged each resource with
the value it replaced), restores each function's previous concurrency, each
service's previous task count and each group's previous size, re-enables the
event sources it disabled, re-enables SES sending and removes the deny
policy, in every region in `kill_switch_regions`.

## Tests

```sh
python3 -m pytest platform/aws/stacks/spend/kill_switch -q
tofu -chdir=platform/aws/stacks/spend test
```

The unit tests use fake clients (no boto3, no AWS); `tofu test` plans the
stack against a mocked provider and checks that only `kill_switch_accounts`
can reach the kill topic, that every budget alerts at 50%, that the freeze
SCP never names a storage, log, audit, DNS, domain or key action, and that
anomaly alerts reach the alerts topic.
