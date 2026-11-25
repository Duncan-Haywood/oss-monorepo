# spend-guards

Stops an AWS bill from growing without anyone noticing, in layers, per
account. Nothing here is applied yet: there is no AWS account. The owner's
part is in [`../OWNER_RUNBOOK.md`](../OWNER_RUNBOOK.md).

| Layer | What it does | Where |
|---|---|---|
| Anomaly detection | Emails the same day a service or an account costs unusually much (≥ `anomaly_threshold_usd`, default $10) | `anomaly.tf` |
| Budget alerts | Emails at 50 %, 80 % and 100 % of each account's monthly budget, and when the forecast passes 100 % | `budgets.tf`, [`../modules/budget`](../modules/budget/) |
| Deny new spend | At the hard line, AWS Budgets itself attaches the `spend-guard-deny-new-spend` SCP to that account: no new instances, services, functions, databases, model calls or email | `scp.tf` |
| Kill switch | At the hard line, a Lambda stops, scales to zero or throttles what is already running in that account | `kill_switch.tf`, `lambda/kill_switch.py`, `member/` |
| Native spend limit | AWS's own per-project cap, if the account is offered it (console only, see below) | owner step |

The SCP and the kill switch work together. The SCP stops anything new from
starting. The kill switch stops what is already running. Neither deletes
anything.

## What stops at the hard line

In an account whose `kill_switch = true` (default: `apps`, `sandbox`), in
`us-east-1` and `us-west-2`, unless a resource is tagged `spend_guard = keep`:

| Resource | What happens | Data |
|---|---|---|
| EC2 instances | stopped | EBS volumes kept |
| Auto Scaling groups | min = max = desired = 0 | launch templates kept |
| ECS services | desired count 0 | task definitions, images kept |
| Lambda functions | reserved concurrency 0; queue/stream triggers disabled | code, config kept; queued messages wait in their queue |
| RDS instances and clusters | stopped | storage and snapshots kept |
| SageMaker endpoints | **reported, not stopped**: stopping one means deleting it, which needs a person | |
| Spot instances | **reported, not stopped**: they cannot be stopped, only terminated | |

Untagged resources are included on purpose. A leaked key's crypto miner has
no tags, and it is exactly what must stop.

In an account whose `hard_action = "scp"` (default: `apps`, `sandbox`,
`shared-infra`), the SCP also denies new spend: launching or starting
compute, creating or updating ECS services and Lambda code, creating or
starting databases and caches, SageMaker, Bedrock model calls, Textract,
Transcribe, sending email through SES, savings plans, Marketplace
subscriptions and domain registration. The full list is `local.deny_new_spend_actions`
in `scp.tf`.

## What keeps running

- **Logs and audit:** CloudTrail, CloudWatch Logs, GuardDuty, Security Hub,
  Config. `log-archive` and `security` are alerts-only, and the SCP denies
  nothing in those services.
- **State:** S3 (the state bucket, the site's bucket), DynamoDB reads and
  writes, KMS, Secrets Manager. Nothing is deleted.
- **DNS and the site:** Route 53 and CloudFront are never touched.
  `shared-infra` has the SCP (no new spend there) but no kill switch, so the
  public site stays up. CloudFront traffic cost is guarded by WAF rate rules
  in the site stack, not here.
- **Payments:** `payments` is alerts-only, so Paddle webhooks keep being
  recorded.
- **Domain renewal** is never denied: a lapsed domain costs more than any overrun.
- **The guard itself** runs in the management account. SCPs never apply to
  the management account.

Known gap: AWS starts a stopped RDS database again after 7 days. While an
account is tripped, run the stop again weekly (the manual command below).
`rds:StartDBInstance` by a person is denied by the SCP, but AWS's own
automatic restart is not something an SCP can deny.

## Resume

1. **Fix the cause.** Read the alert and the kill switch's log
   (`/aws/lambda/spend-guards-kill-switch`), which lists every action as
   JSON. If the budget was simply too low, raise `monthly_limit_usd` in the
   tfvars through a PR.
2. **Detach the SCP** by reversing the budget action (management account,
   from an Identity Center admin session):

   ```sh
   aws budgets describe-budget-actions-for-budget --account-id <MGMT_ID> --budget-name spend-apps-monthly
   aws budgets execute-budget-action --account-id <MGMT_ID> --budget-name spend-apps-monthly \
     --action-id <ACTION_ID> --execution-type REVERSE_BUDGET_ACTION
   ```

   The action ids are also in this stack's `budget_action_ids` output. In
   the console it is Billing → Budgets → the budget → Actions → Reverse.
   AWS runs an action once per budget period, so a reversed action stays
   reversed until next month unless spend crosses again in a new period.
3. **Restart what was stopped.** The kill switch wrote the previous size of
   everything it changed into a `spend_guard_prev` tag, and resume restores
   exactly that and removes the tag:

   ```sh
   aws lambda invoke --function-name spend-guards-kill-switch \
     --cli-binary-format raw-in-base64-out \
     --payload '{"operation":"resume","account":"apps","dry_run":true}' out.json && cat out.json
   # read the plan, then run it again with "dry_run":false
   ```

   Add `"stacks":["saas-starter"]` to resume (or stop) only resources whose
   `stack` tag matches.

A manual stop is the same call with `"operation":"stop"`. It works on any
account in `accounts`, including those whose `kill_switch` is off (that
flag only controls the automatic trigger).

## Native spend limits

AWS now offers a hard monthly spend limit per project for accounts created
through its "new AWS experience". As of November 2026 it is in limited
rollout, set in the Billing console, and has no API or OpenTofu resource we
could find. It does not cover a whole account. So it is an owner step (in
the runbook), done only if the console offers it, and the layers above work
without it. Re-check for an API when the provider adds one.
Sources: [AWS Developers announcement](https://x.com/awsdevelopers/status/2113707070809682373),
[AWS Builder article on hard limits](https://builder.aws.com/content/3JIQHmBWUcACv7DHlfeaOBupZ8K/how-to-put-a-hard-spending-limit-on-your-aws-account-before-its-too-late).

## Apply order

Prerequisites: the `bootstrap` stack (state bucket, GitHub OIDC provider and
roles) and the organization stack (accounts) are applied.

1. **`spend-guards/`**, in the management account, by role
   `gha-oss-monorepo-spend-guards-apply`.
   - `backend.hcl` from `backend.hcl.example`; variables from
     `terraform.tfvars.example`.
   - `TF_VAR_alert_emails` comes from the `aws-prod` environment secret
     `AWS_ALERT_EMAILS` (a JSON list). It is personal data, so it is never
     committed or printed.
   - Account ids: set `org_state` so they are read from the organization
     stack's `account_ids` output (a map from account name to id). If that
     stack names its output differently, pass the ids in `accounts` instead.
   - If the apply fails on `aws_ce_anomaly_monitor.services` because AWS
     already made a default services monitor at sign-up, import it:
     `tofu import 'aws_ce_anomaly_monitor.services[0]' <its ARN>`.
2. **`spend-guards/member/`**, once per member account (each with its own
   state key, `stacks/spend-guards-member/<account>/terraform.tfstate`),
   with `kill_switch_lambda_role_arn` set to step 1's output of the same
   name. Apply it in every member account, even those with the kill switch
   off, so a manual stop works everywhere.
3. **Check it** (dry run, changes nothing):
   `aws lambda invoke --function-name spend-guards-kill-switch --cli-binary-format raw-in-base64-out --payload '{"account":"sandbox","dry_run":true}' out.json`.
   `out.json` lists what would stop. Errors would mean a member role is
   missing.

Start with `kill_switch_mode = "dry_run"` for the first month if you want to
watch what it would do. A dry run still emails and still attaches the SCP;
only the stopping is skipped.

The apply role needs: `budgets:*` on `arn:aws:budgets::<mgmt>:budget/spend-*`,
`ce:*AnomalyMonitor*`/`ce:*AnomalySubscription*`, `organizations:CreatePolicy`/
`UpdatePolicy`/`DescribePolicy`/`DescribeOrganization`, and IAM, Lambda, SNS,
SQS, KMS, CloudWatch Logs and alarms scoped to `spend-guards-*` names. In each
member account it needs only IAM on `role/spend-kill-switch`.
[`ci/README.md`](ci/README.md) has the workflow sketch.

## Verify locally

```sh
python3 -m unittest discover -s platform/aws/spend-guards/lambda -v   # 36 tests, no network, no boto3
cd platform/aws/spend-guards        && tofu init -backend=false && tofu validate && tofu test   # 11 runs
cd platform/aws/spend-guards/member && tofu init -backend=false && tofu validate && tofu test   # 2 runs
cd platform/aws/modules/budget      && tofu init -backend=false && tofu validate && tofu test   # 7 runs
checkov -d platform/aws/spend-guards -d platform/aws/modules/budget --framework terraform
```

The `tofu test` files check the security invariants against mocked
providers:
- the SCP denies, exempts only the kill-switch role, and leaves storage, logs, DNS, keys and renewals alone;
- the budget-actions role trusts only AWS Budgets, from this account, and can attach only that SCP to opted-in accounts;
- the Lambda role has no wildcard actions and can assume only `spend-kill-switch` in known accounts;
- the member role can only list, stop, scale, throttle and tag, never delete, terminate, read data or change IAM, and only on its own account's ARNs;
- everything at rest is KMS-encrypted, key rotation is on, and logs are kept a year;
- the kill-switch topic accepts only AWS Budgets, over TLS.

## Not done yet

- **Code signing** for the Lambda (Checkov CKV_AWS_272, skipped with that
  reason). It needs an AWS Signer profile, which belongs in the org baseline.
- **Weekly re-stop while tripped**, for RDS's 7-day automatic restart. Today
  it is the manual command above. An EventBridge schedule could do it once
  the first real trip shows it is needed.
- **Client accounts** (`aws-client-accounts`) join by adding an entry to
  `accounts`, with `kill_switch = true` and the client's agreed cap.
