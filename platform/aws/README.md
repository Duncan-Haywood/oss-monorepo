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
stacks/org                 Organization, OUs, six member accounts, SCPs, Identity Center for the owner
stacks/baseline            org CloudTrail to an object-locked bucket; GuardDuty, Security Hub
                           (FSBP + CIS), Config, Access Analyzer org-wide; per-account baseline
stacks/spend               budgets per account, budget actions (freeze SCP), kill-switch Lambda
stacks/llm                 Claude Platform on AWS IAM (apps + CI gate), outbound web identity federation
stacks/email               SES identities, DKIM, MAIL FROM, DMARC, config sets, events -> SNS -> SQS
stacks/app-identity        TRANSITIONAL: an IAM user for Cloudflare Workers, key rotated in Secrets Manager
stacks/github-oidc         per-stack CI roles and a state bucket in each workload account (payments: private repo only)
stacks/findings            HIGH/CRITICAL Security Hub findings -> SQS -> files on security-alerts
```

Apply order (the apply workflow follows it): `org`, `baseline`, `spend`,
`llm`, `email`, `app-identity`; then `github-oidc` and `findings` (both
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

## The bootstrap: what the owner runs, and what each role can do

`bootstrap/bootstrap.yaml` creates, in the management account:

- the GitHub Actions OIDC provider;
- a KMS key (`alias/tofu-state`) and the state bucket
  `<account>-tofu-state-<region>` (versioned, KMS-encrypted, private,
  TLS-only, old versions kept a year). OpenTofu >= 1.10 locks with a lock
  object in the bucket (`use_lockfile`), so there is no DynamoDB table;
- **`github-plan`**: assumable only by `pull_request` workflows of this
  repository (`sub = repo:Duncan-Haywood/oss-monorepo:pull_request`; fork PRs
  get no OIDC token). `ReadOnlyAccess`, read of the state, assume
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
