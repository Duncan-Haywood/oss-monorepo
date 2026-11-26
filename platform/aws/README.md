# platform/aws: the AWS platform as OpenTofu

The owner, 2026-11-24: "migrate to aws and run the llm api and the email api
through aws one provider instead of managing multiple accounts ... start
setting up for the switch and when ready to do it without downtime we do the
switch." The decisions behind this tree are in
[`docs/reports/2026-11-24-cloud-provider-comparison.md`](../../docs/reports/2026-11-24-cloud-provider-comparison.md),
§7 (an AWS Organization, account isolation, SCPs, the security baseline,
GitHub OIDC, OpenTofu, spend guards, no long-lived keys). The cutover itself,
with the owner's checklist: [`docs/runbooks/aws-cutover.md`](../../docs/runbooks/aws-cutover.md).
Tasks it serves: `aws-org-baseline`, `aws-spend-guards`, `aws-ses-email` in
[`portfolio/work/tasks.yaml`](../../portfolio/work/tasks.yaml).

**LLM:** Claude Platform on AWS (Anthropic-operated, the same Messages API
and bare model IDs such as `claude-opus-5-5`, SigV4 with service name
`aws-external-anthropic`, endpoint `https://aws-external-anthropic.{region}.api.aws`,
an `anthropic-workspace-id` header, billed through AWS Marketplace). Amazon
Bedrock is the documented alternative (`stacks/llm/bedrock.tf`, off).
**Email:** Amazon SES v2.

## Layout

```
bootstrap/bootstrap.yaml   the one thing the owner runs (CloudFormation, from CloudShell)
github/configure.sh        GitHub environments and variables, as code (run once by a repo admin)
modules/account-baseline   what every account gets
modules/workload-boundary  the permissions boundary (single-account mode: also what the SCPs denied)
stacks/org                 Organization, OUs, six member accounts, SCPs, Identity Center for the owner
                           (single-account mode: only the account's workload-boundary)
stacks/baseline            org CloudTrail to an object-locked bucket; GuardDuty, Security Hub
                           (FSBP + CIS), Config, Access Analyzer org-wide; per-account baseline
stacks/spend               budgets per account, budget actions (freeze SCP), kill-switch Lambda
stacks/llm                 Claude Platform on AWS IAM (apps + CI gate), outbound web identity federation
stacks/email               SES identities, DKIM, MAIL FROM, DMARC, config sets, events -> SNS -> SQS
stacks/app-identity        TRANSITIONAL: an IAM user for Cloudflare Workers, key rotated in Secrets Manager
stacks/github-oidc         per-stack CI roles and a state bucket in each workload account (payments: private repo only)
stacks/findings            HIGH/CRITICAL Security Hub findings -> SQS -> files on security-alerts
stacks/cutover-access      the Cloudflare -> AWS cutover's roles (GitHub OIDC, one environment each)
stacks/cloudflare          the Cloudflare account as OpenTofu (export + switch.tf); applied only by the cutover
cutover/                   the cutover orchestrator, app list, fakes and tests (cutover/README.md)
```

Apply order (the apply workflow follows it): `org`, `baseline`, `llm`,
`email`, `app-identity`, `cutover-access`, `spend` (last, so its
single-account freeze sees every role); then `github-oidc` and `findings` (both
with the management credentials, not yet in the workflow). After those come
the workload stacks, each applied by its own `gha-<repo>-<stack>-apply` role
against its own account's state bucket: `dns` (shared-infra), then `site`
(shared-infra), then `saas-starter` (apps), then the product stacks
(`listing-lens`, `shift-roster`, `retail-pilot-intel`, `ai-first-markets`,
apps). `edge-api` and `email-ops` (apps) have CI roles but still apply with
the management credentials (`stacks/github-oidc/README.md`, "Not yet CI-ready"). `payments` is applied from the private repository. Each stack has its own state key
(`<stack>/terraform.tfstate`) and reads the ones before it through
`terraform_remote_state`.

## Accounts

| Account | OU | Holds |
|---|---|---|
| management (the one the owner creates) | root | the Organization, billing, the org trail's definition, the CI roles, budgets and the kill switch. No workloads. |
| log-archive | security | the object-locked CloudTrail and Config bucket |
| security | security | delegated admin for GuardDuty, Security Hub, Config, Access Analyzer |
| shared-infra | infrastructure | DNS and the site later (tasks `aws-route53-zone`, `aws-site-cloudfront`) |
| apps | workloads | Claude Platform on AWS (its workspace), SES, products |
| payments | payments | the Paddle webhook receiver later; no deploy role reachable from this public repository |
| sandbox | sandbox | experiments |

SCPs on every OU (`stacks/org/scps.tf`): no leaving the Organization; no
stopping CloudTrail, GuardDuty, Config, Security Hub or Access Analyzer, no
turning off account-level S3 Block Public Access or default EBS encryption;
no root user; no IAM users or access keys (except the transitional ones
below); only `allowed_regions`; no purchases or commitments, and AWS
Marketplace subscriptions only by the owner's Identity Center role.

RCPs on every OU (`stacks/org/rcps.tf`): S3, KMS, Secrets Manager and SQS
answer only this organization's principals and AWS services (a data
perimeter, so a mistaken bucket or key policy grants an outsider nothing;
serve public content through CloudFront, never a public bucket). On the
Payments OU: no GitHub Actions token whose subject is this public repository
is accepted, whatever a role's trust policy says.

## Single-account mode

For an AWS account that cannot run AWS Organizations (for example one made
through AWS's project-based sign-up). One variable, `account_mode =
"organization" | "single"` (default `organization`), is read by every stack;
the workflows set it from the repository variable `AWS_ACCOUNT_MODE`, and the
bootstrap takes the same value as `AccountMode`. How to tell which one an
account supports: [`docs/runbooks/cutover-run-day.md`](../../docs/runbooks/cutover-run-day.md), "Step 0".

| | organization | single |
|---|---|---|
| `org` | Organization, OUs, six accounts, SCPs, RCPs, root-access feature, Identity Center assignments | none of those; the account's `workload-boundary` (`modules/workload-boundary`). `account_ids` maps every name to this account, so `terraform_remote_state` readers work unchanged |
| providers | member-account aliases assume `OrganizationAccountAccessRole` (plan: `github-plan-readonly`) | `dynamic "assume_role"` with no block: the workflow's own credentials |
| guardrails | SCPs on every OU | the boundary on every role the stacks create, and explicit denies on `github-apply` (`bootstrap.yaml`, `Single*` statements), which cannot carry a boundary it applies |
| `baseline` | org trail, delegated admins, org-wide GuardDuty, Security Hub central configuration, Config aggregator, org Access Analyzer | the account's multi-region trail, GuardDuty detector, Security Hub with FSBP and CIS subscribed, Config recorder, account Access Analyzer |
| `spend` | a budget per account, the freeze SCP attached by an `APPLY_SCP_POLICY` action | one budget (`organization_limit_usd`), an IAM policy `spend-freeze` attached by an `APPLY_IAM_POLICY` action to the account's roles (applied last, so it sees them) |
| `github-oidc` | roles and a state bucket per workload account | one set in the account, a `-workloads-` state bucket, the boundary on the CI roles too; no payments roles |
| `cutover-access` | member roles `cutover-read` / `cutover-operate` | the same policies on `github-cutover-plan` / `github-cutover`; `CUTOVER_SINGLE_ACCOUNT=true` |

What the boundary carries in single mode, in place of the SCPs: no IAM users,
keys, OIDC/SAML providers, account, Organizations or SSO changes; no changes
to the `gha-*` roles, the bootstrap's `/github/` roles or the boundary
itself; CloudTrail, GuardDuty, Config, Security Hub, Access Analyzer, account
Block Public Access and default EBS encryption left alone; only
`allowed_regions` for regional services (the SCP's global-service list,
shared in `stacks/org/scps.tf`); no purchases, commitments or Marketplace
subscriptions; no writes to the management stacks' state. `github-apply`
gets the same denies except that it may set up (never stop or delete) audit
and detection, and may create IAM users only under `/transitional/` (the
Worker identity, as the SCP's `OrganizationAccountAccessRole` exemption
allowed in a member account), never keys or passwords.

What single mode gives up, and why it is still acceptable for a start:

- **Blast radius.** Workloads share an account with the management stacks.
  The boundary keeps workload roles from rewriting management state or CI
  roles, but a compromised `github-apply` reaches everything, as it does the
  management account in organization mode.
- **No RCP data perimeter.** Bucket, key and queue policies are the only
  guard against granting an outsider; Access Analyzer reports external
  access.
- **No payments account.** The payments stack is not given roles: its
  isolation from this public repository needs a separate account and an RCP.
  It waits for an Organization (or a second, separate account).
- **The rotator role carries no boundary**: the boundary denies
  `iam:CreateAccessKey`, which is the rotator's whole job; its own policy
  names the one transitional user.
- **Moving to an Organization later** is a migration (new member accounts,
  state moves), not a variable flip; plan it in a PR first.

Region: everything defaults to `us-east-2`. `us-east-1` stays where AWS
requires it: CloudFront's ACM certificate, WAF and their logs
(`stacks/site`'s pinned provider, `modules/static-site`), Route 53 query logs
(`stacks/dns`), and the global services exempted by name in the region rule.
`allowed_regions` is therefore `["us-east-2", "us-east-1"]`.

Provider note (checked 2026-11-26 with OpenTofu 1.13.10 and
`hashicorp/aws` 6.72.0, `tofu plan` with dummy credentials): a `dynamic
"assume_role"` block with no instances plans cleanly and assumes nothing; one
instance assumes the role. An `assume_role { role_arn = "" }` also skips the
assume but warns that it "will be an error in a future release", so the
stacks use the dynamic form.

## The bootstrap: what the owner runs, and what each role can do

`bootstrap/bootstrap.yaml` creates, in the management account:

- the GitHub Actions OIDC provider;
- a KMS key (`alias/tofu-state`) and the state bucket
  `<account>-tofu-state-<region>` (versioned, KMS-encrypted, private,
  TLS-only, old versions kept a year). OpenTofu >= 1.10 locks with a lock
  object in the bucket (`use_lockfile`), so there is no DynamoDB table;
- **`github-plan`**: assumable only by `pull_request` workflows of this
  repository (`sub = repo:Duncan-Haywood/oss-monorepo:pull_request`, or the
  immutable form `repo:Duncan-Haywood@49566815/oss-monorepo@1315497858:pull_request`
  that GitHub issues for this repository; fork PRs get no OIDC token). `ReadOnlyAccess`, read of the state, assume
  `github-plan-readonly` in member accounts, and explicit denies on reading
  data: S3 objects outside the state, KMS decrypt outside the state key,
  Secrets Manager values, SSM parameters, DynamoDB items, log events, Lambda
  code, SQS messages, Athena results, CloudTrail lookups. It can see how
  things are configured, not what they hold;
- **`github-apply`**: assumable only by jobs in the `aws-prod` GitHub
  environment (`sub = ...:environment:aws-prod`), which
  `github/configure.sh` limits to `main`. `AdministratorAccess` in the
  management account (an Organization baseline cannot be applied with less)
  minus explicit denies: it cannot change the bootstrap (the two roles, the
  OIDC provider, the CloudFormation stack, the state bucket's policy,
  versioning, encryption or old versions, the state key), cannot leave or
  delete the Organization or close or remove accounts, cannot touch billing,
  payment methods or tax settings, cannot subscribe in AWS Marketplace, buy
  Savings Plans or reservations, register or transfer domains, and cannot
  create IAM users, access keys or console passwords. In member accounts it
  works through `OrganizationAccountAccessRole`.

### No secrets in state

The plan role reads the state on every pull request, so no stack stores a
secret value in it: the transitional access key is minted by the rotator
Lambda straight into Secrets Manager, never by `aws_iam_access_key`; DKIM
uses Easy DKIM (AWS holds the private key). Keep it that way: a resource
that returns a secret (`aws_iam_access_key`, a generated password, a
`aws_secretsmanager_secret_version` with a value) does not belong in these
stacks.

### Review of this tree

`github-apply` applies whatever lands on `main` under `platform/aws/`, so
these files are as sensitive as the workflows. `/platform/aws/` is listed in
`.github/CODEOWNERS`, which since 2026-11-24 makes it control-plane tier for
the `adversarial-gate` check (no human approval: main's rules, including
`aws-guardrail-weakened` and `iac-exposure`, plus the LLM red-team review;
docs/security/agent-hardening.md). The privileged jobs run only `tofu` and inline
shell, so `python3 -I platform/ci/ci_policy_check.py` passes either way, but
that check cannot see that `tofu` executes `.tf` files.

## Transitional: credentials for Cloudflare Workers

Until the products move onto AWS (task `aws-move-products`), a Worker cannot
assume an IAM role. `stacks/app-identity` makes one IAM user,
`transitional-worker`, that may only call Claude Platform on AWS (the
`claude-platform-invoke` policy), send mail through the SES identities and
configuration sets here, and read the SES feedback queue. Its key:

- exists only in Secrets Manager (`transitional/worker-aws-credentials`,
  its own KMS key), minted by `rotator/rotate.py`;
- rotates every 30 days; the key from two rotations ago is deleted, so the
  previous key keeps working for a whole period;
- reaches the Workers through `.github/workflows/priv-aws-worker-secret-sync.yml`
  (daily, the `cloudflare` environment, a role that can read only the
  current version of that one secret).

The user and the sync role are tagged `spend-guard=deny-on-budget`, so the
kill switch cuts them when the apps budget is spent. Delete the stack, the
sync workflow and the SCP exemption for `/transitional/` when the last
product runs on AWS with role credentials (`stacks/llm` `app-llm`).

## Checks

Run here, 2026-11-24, with OpenTofu 1.13.10 (release tarball, SHA256 checked)
and the `hashicorp/aws` 6.72.0 and `hashicorp/archive` 2.8.1 providers
(installed from releases.hashicorp.com through a filesystem mirror, SHA256
checked; the lock files pin their `h1:` hashes):

```sh
tofu fmt -check -recursive platform/aws
for d in platform/aws/stacks/*/; do
  tofu -chdir="$d" init -backend=false && tofu -chdir="$d" validate && tofu -chdir="$d" test
done
python3 -m pytest platform/aws -q                    # kill switch + rotator, fake clients
checkov -d platform/aws --framework terraform,cloudformation --quiet
trivy config --severity HIGH,CRITICAL platform/aws
cfn-lint platform/aws/bootstrap/bootstrap.yaml
python3 -I platform/ci/ci_policy_check.py
```

Results: fmt clean; all six stacks valid; `tofu test` 9 runs pass (mocked
AWS provider: plans, and for `email` a mocked apply, with assertions on the
plan's shape); 15 pytest tests pass; Checkov 3.4.10: 0 failed (807 passed,
50 skipped, each skip with its reason inline); Trivy 0.76.2: 0 HIGH or
CRITICAL; cfn-lint 1.61.0 clean; ci-policy passes. `priv-aws-plan.yml`'s
`check` job runs the same on every PR. `tofu plan` against the real
accounts runs in the `plan` job once `AWS_ACCOUNT_ID` is set.

## Facts, and where each came from

| Fact | Source |
|---|---|
| Claude Platform on AWS IAM actions (`CreateInference`, `CountTokens`, `GetModel`, `ListModels`, `GetWorkspace`, `ListWorkspaces`, batch actions, `CallWithBearerToken`), `sts:GetWebIdentityToken` with its audience and `aws:CalledViaLast` condition, `sts:TagGetWebIdentityToken`, workspace ARN format, region binding, "all AWS commercial regions", outbound web identity federation, spend limits and tier caps | platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws, read 2026-11-24 |
| `aws_iam_outbound_web_identity_federation`, every resource and attribute used | `hashicorp/aws` 6.72.0 provider schema (`tofu providers schema -json`) |
| SES `PutAccountDetails` parameters and limits | botocore 1.44.11 `sesv2` service model |

Not verified in this session (docs.aws.amazon.com was unreachable), so check
before or at the first apply:

- the region-deny SCP's list of global services (adapted from AWS's example);
- the Security Hub standard ARNs for FSBP and CIS 3.0.0
  (`aws securityhub describe-standards`);
- the SES DNS record shapes (DKIM CNAMEs, MAIL FROM MX and SPF): compare with
  the SES console once the identity exists;
- that an OIDC provider without a thumbprint list deploys (cfn-lint's
  schema says the list is optional);
- the IAM actions for Bedrock's Messages-API endpoint (`bedrock-mantle`), if
  the Bedrock alternative is ever turned on;
- whether `@anthropic-ai/aws-sdk` runs inside a Cloudflare Worker; if not, a
  Worker signs requests with SigV4 itself (service `aws-external-anthropic`).

No prices are quoted here. GuardDuty, Security Hub, Config, CloudTrail, KMS
keys and Secrets Manager each bill monthly (CloudTrail data events are not
enabled); the budgets in `stacks/spend` watch
the total.
