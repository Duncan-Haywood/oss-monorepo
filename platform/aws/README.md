# platform/aws: everything on AWS, as OpenTofu

The owner decided on 2026-11-24 to consolidate the platform onto AWS, security
first (`docs/reports/2026-11-24-cloud-provider-comparison.md`, §7). This tree
holds every AWS stack. Nothing here has been applied: there is no AWS account
yet. Each stack is written to be applied by CI the day the owner opens the
management account (turnover checklist at the end).

Work queue: `python3 portfolio/work/workctl.py list --direction aws-consolidation`
and `--direction security-first`.

## Conventions (every stack follows these)

- **Layout.** One root module per stack in `platform/aws/<stack>/`, reusable
  modules in `platform/aws/modules/<name>/`. A stack consumes another stack's
  values through `terraform_remote_state` outputs listed in "Outputs other
  stacks may read" below, never by editing its directory.
- **Versions.** OpenTofu `required_version = ">= 1.10.0"`; provider
  `hashicorp/aws` `~> 6.0` (plus `hashicorp/archive`, `hashicorp/random` where
  needed). Commit `.terraform.lock.hcl` when it can be generated.
- **Backend.** `backend "s3" { use_lockfile = true }` with the rest supplied
  by `backend.hcl` (git-ignored). `bootstrap/backend-config.sh <stack>` prints
  it; `backend.hcl.example` sits beside each stack. Key:
  `stacks/<stack>/terraform.tfstate`. No `encrypt`/`kms_key_id`: the bucket's
  default encryption puts every object under the state KMS key.
- **Regions.** Home `us-east-1` (CloudFront, its ACM certificates and WAF need
  it). Allowed: `us-east-1`, `us-west-2`; an SCP denies the rest.
- **Identity.** No long-lived keys anywhere. CI authenticates with GitHub
  OIDC to `gha-<repo>-<stack>-plan` (pull requests, read-only, run with
  `-lock=false`) or `gha-<repo>-<stack>-apply` (main only, GitHub environment
  `aws-prod`). The foundation stacks (bootstrap, org, baseline,
  baseline/account, github-oidc) share `gha-oss-monorepo-foundation-plan` /
  `-apply` from the CloudFormation seed, environment `aws-foundation`
  (owner-approved). Each role lives in the account its stack changes. Providers
  take `var.deploy_role_arn` (default `null`) and assume it through a
  `dynamic "assume_role"` block: CI, already holding the stack's role, leaves
  it null; a human session or a role chain sets it. Never hardcode an account
  ID; set `allowed_account_ids` from a variable where the stack knows it.
- **Accounts** (names used across stacks): `management`, `log-archive`,
  `security`, `shared-infra` (DNS, site, edge), `apps`, `payments`, `sandbox`.
- **Tags.** `default_tags`: `managed_by = "opentofu"`, `stack = "<stack>"`,
  `repo = "oss-monorepo"`.
- **Secrets** only in Secrets Manager or SSM SecureString, referenced by
  name. Never a value in the tree, a variable default, a plan file or a log.
- **Policies as `jsonencode`.** Write IAM, bucket and key policies with
  `jsonencode()` rather than `data "aws_iam_policy_document"`, so `tofu test`
  with `mock_provider "aws"` can assert on their real content (a mocked
  data source returns random strings).
- **Verification before merge.** `tofu fmt -check`, `tofu init -backend=false`,
  `tofu validate`, `tofu test` (mocked provider; cover no public buckets,
  encryption on, least-privilege IAM), Checkov (`checkov -d <stack>
  --framework terraform`). Skip a Checkov finding only inline, with
  `# checkov:skip=<ID>:<reason>`. The CI job that runs these is drafted at
  `bootstrap/ci/aws-iac-check.yml` (control plane: the owner moves it into
  `.github/workflows/`).
- **Nothing is applied by an agent.** No account is created and no money is
  spent until the owner does the turnover steps below.

## Stacks, accounts and apply order

| # | Stack | Account(s) | CI role | Writes | Task |
|---|---|---|---|---|---|
| 0 | `bootstrap/cfn/github-oidc-seed.yaml` | management | (owner, one console launch) | OIDC provider, `foundation-plan`/`-apply` roles | aws-org-baseline |
| 1 | `bootstrap` | management | foundation | state bucket + KMS key | aws-org-baseline |
| 2 | `org` | management | foundation | Organization, OUs, 6 member accounts, SCPs, RCP, Identity Center | aws-org-baseline |
| 3 | `baseline` | management, log-archive, security | foundation | org CloudTrail, log bucket, GuardDuty, Security Hub, Config aggregation, Access Analyzer, findings queue | aws-org-baseline |
| 3b | `baseline/account` | every account, both regions | foundation (chains into `OrganizationAccountAccessRole`) | S3 BPA, EBS encryption, KMS key, Config recorder | aws-org-baseline |
| 4 | `github-oidc` | every account | foundation | OIDC providers, per-stack plan/apply roles | aws-org-baseline |
| 5 | `spend-guards` | management (+ per account) | `spend-guards` | budgets, spend limits, kill switch | aws-spend-guards |
| 6 | `dns` | shared-infra | `dns` | Route 53 zone mirrored from Cloudflare | aws-route53-zone |
| 7 | `site`, `edge`, `email` | shared-infra | one each | S3 + CloudFront + WAF; edge API; SES | aws-site-cloudfront, aws-edge-api, aws-ses-email |
| 8 | `saas-starter` | apps | `saas-starter` | the product starter | aws-saas-starter |
| 9 | `products` | apps | `products` | products moved onto the starter | aws-move-products |
| – | `client-accounts` | management | `client-accounts` | one account per client | aws-client-accounts |
| – | `payments` | payments | private repository only | Paddle webhook receiver | (private-monorepo) |

Apply in that order: bootstrap → org → baseline → baseline/account →
github-oidc → spend-guards → dns → site/edge/email → saas-starter → products.
Each stack's README gives its own commands and what the owner must do.

`payments` is applied only from `Duncan-Haywood/private-monorepo`: no role
assumable from this public repository's Actions can touch the payments
account or its state (enforced in `github-oidc` and `bootstrap`, tested, and
backed by a resource control policy from `org`).

## Outputs other stacks may read

Read with `terraform_remote_state` (backend `s3`, bucket from
`bootstrap/backend-config.sh`, key `stacks/<stack>/terraform.tfstate`,
region `us-east-1`). Every CI role in the organization may read the state of
`bootstrap`, `org`, `baseline`, `github-oidc` and `dns` (bootstrap variable
`shared_state_stacks`); any other stack's state is readable only by its own
roles. Names below are a contract: change one only together with its readers.

| Stack | Output | Type |
|---|---|---|
| bootstrap | `state_bucket_name`, `state_bucket_arn`, `state_kms_key_arn`, `state_region` | string |
| org | `organization_id`, `organization_root_id` | string |
| org | `account_ids` | map(string), keys are the account names above |
| org | `ou_ids` | map(string): `security`, `infrastructure`, `workloads`, `payments`, `sandbox`, `clients` |
| baseline | `log_archive_bucket_name`, `log_archive_bucket_arn`, `findings_queue_url`, `findings_queue_arn` | string |
| github-oidc | `role_arns` | map(object({plan, apply})), keyed by stack |
| github-oidc | `oidc_provider_arns` | map(string), keyed by account name |

## Owner turnover checklist (draft)

The spend-guards task writes the detailed, click-by-click owner runbook at
`platform/aws/OWNER_RUNBOOK.md` (not written yet); this is the outline it expands.
Every step is one AWS forces on a human or that only the owner may decide.

1. **Open the management account** (sign-up, card). Turn on MFA for the root
   user (a passkey or hardware key), then stop using root.
2. **Launch the seed** in that account, region us-east-1: CloudFormation,
   Create stack, upload `bootstrap/cfn/github-oidc-seed.yaml`, accept the
   defaults. It creates the GitHub OIDC provider and the two foundation roles.
3. **In GitHub** (repository settings): create two environments, both limited
   to the `main` branch: `aws-foundation` with yourself as required reviewer
   (its role administers the whole organization, so each foundation apply
   waits for your click), and `aws-prod` without a reviewer (workload stacks,
   each bounded to its own account and role prefix). Add the
   Actions variables `AWS_MANAGEMENT_ACCOUNT_ID` and
   `AWS_ACCOUNT_EMAIL_TEMPLATE` (for example `aws+%s@<your domain>`, one
   address per member account; it is personal data, so a variable, not a
   file).
4. **Approve the control-plane PR** that adds the AWS workflows (drafted in
   `bootstrap/ci/`). From then on CI plans every PR and applies on merge.
5. CI applies `bootstrap` (`bootstrap/first-apply.sh`), then `org`, which
   creates the Organization and the six member accounts.
6. **Enable IAM Identity Center** (console, organization instance, us-east-1),
   then set the Actions variable `AWS_IDENTITY_CENTER_ENABLED=true`. CI
   re-applies `org`, which creates the permission sets and the
   `platform-admins` group. Add yourself to the group, register an MFA
   device, and require MFA at every sign-in (Identity Center settings; not
   exposed to OpenTofu).
7. CI applies the remaining stacks in order. Nothing further needs an agent.
   Spend guards land before any workload (step 5 in the table).
