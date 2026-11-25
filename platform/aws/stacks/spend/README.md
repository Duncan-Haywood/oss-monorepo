# stacks/spend: budgets, the spend freeze and the kill switch

Task `aws-spend-guards` (`portfolio/work/tasks.yaml`). Applied in the
management account by `.github/workflows/priv-aws-apply.yml`.

## The layers

| When (per account, monthly, actual cost) | What happens | Made by |
|---|---|---|
| 80% of the account's budget | alert on the `budget-alerts` SNS topic (and email, if `AWS_BUDGET_ALERT_EMAIL` is set) | `aws_budgets_budget.account` |
| forecast passes 100% | alert | same |
| `freeze_at_percent` (default 100%) | AWS Budgets attaches the `spend-freeze` SCP to the account: nothing new starts | `aws_budgets_budget_action.freeze` |
| same moment | the `budget-kill` topic invokes the kill switch, which stops what is running | `kill_switch/handler.py` |
| organisation passes 80% / forecast 100% of `organization_limit_usd` | alert only | `aws_budgets_budget.organization` |

The limits in `variables.tf` are starting dials for an empty organisation,
not quotes of any price. Raise one in a pull request when a product's real
usage needs it.

AWS Budgets works from billing data that lags by hours, and the provider has
no hard spending-cap resource (none in `hashicorp/aws` 6.72.0's schema), so
spending can overshoot a limit before anything acts. The limits are therefore
set below what the owner can afford to lose. Claude Platform on AWS has its
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

## What the kill switch stops

In the account whose budget fired, in the home region:

- **IAM:** a deny policy (`spend-guard-deny`: Claude Platform on AWS, Bedrock,
  SES sending) on every role and user tagged `spend-guard=deny-on-budget`
  (`app-llm`, `github-llm-gate`, `transitional-worker`).
- **SES:** account sending paused.
- **Lambda:** reserved concurrency set to 0 (the function and its code stay).
- **ECS:** services scaled to 0 tasks.
- **EC2:** running instances stopped.
- **RDS:** available DB instances stopped (Aurora clusters are not touched;
  AWS restarts a stopped RDS instance after 7 days).

Anything tagged `spend-guard=exempt` is skipped, and the switch never
throttles itself.

## What keeps running

Everything that bills little or nothing while idle and holds data or
reachability: S3 buckets and objects, DynamoDB tables, SQS queues, SNS
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
2. Detach the freeze: `aws organizations detach-policy --policy-id <freeze_policy_id output> --target-id <account id>`
   (the budget action re-attaches it if spend is still over).
3. Put back what the kill switch stopped:

```sh
aws lambda invoke --function-name spend-kill-switch \
  --payload '{"action":"resume","account":"apps"}' --cli-binary-format raw-in-base64-out out.json
```

`resume` starts only what the switch stopped (it tagged each resource with
the value it replaced), restores each function's previous concurrency and
each service's previous task count, re-enables SES sending and removes the
deny policy.

## Tests

```sh
python3 -m pytest platform/aws/stacks/spend/kill_switch -q
tofu -chdir=platform/aws/stacks/spend test
```

The unit tests use fake clients (no boto3, no AWS); `tofu test` plans the
stack against a mocked provider.
