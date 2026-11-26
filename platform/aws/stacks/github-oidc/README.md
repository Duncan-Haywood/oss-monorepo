# stacks/github-oidc: CI roles for the workload stacks

The management-account stacks (`org`, `baseline`, `spend`, `llm`, `email`,
`app-identity`) apply through the bootstrap's `github-plan` /
`github-apply`. The workload stacks (`dns`, `site`, `saas-starter`,
`edge-api`, `email-ops`, the product stacks `listing-lens`, `shift-roster`,
`retail-pilot-intel` and `ai-first-markets`, and `payments` from the private
repository) should not share that one administrator role. This stack gives
each of them its own pair of roles in the account it changes. Each workload
account also gets its own state bucket, so no stack's state sits where
another account's roles can read it.

## What it creates, in security, shared-infra, apps and payments

- the GitHub OIDC provider (in apps it reuses the one `stacks/llm` made:
  AWS allows one per URL per account, so apply `llm` first);
- a state bucket `<account>-tofu-state-<region>` (the bootstrap's naming)
  with its own rotating KMS key. It is versioned, private, TLS-only, and
  refuses every principal from another account;
- a `workload-boundary` permissions boundary;
- per stack:

| Role | Trusted subject (exact) | Can |
|---|---|---|
| `gha-<repo>-<stack>-plan` | `repo:Duncan-Haywood/<repo>:pull_request` | `ReadOnlyAccess`; read `<stack>/` state and the account's shared keys (`dns/` in shared-infra; `saas-starter/` and `edge-api/` in apps); never write, never read secrets or SSM parameters |
| `gha-<repo>-<stack>-apply` | `repo:Duncan-Haywood/<repo>:environment:aws-prod` | its managed policies; write `<stack>/` state only; create and edit IAM roles and policies named `<prefix>-*` for each of the stack's `iam_prefixes` (default: the stack's name), and only with the boundary attached |
| `gha-oss-monorepo-findings-read` (security) | `repo:Duncan-Haywood/oss-monorepo:ref:refs/heads/main` | receive and delete messages on `security-findings` (`../findings`) |

The boundary caps every role a workload creates. It denies:
- IAM users, access keys, and OIDC or SAML providers
- Organizations, Account and Identity Center calls
- any change to `gha-*` roles or the boundary itself
- object-lock bypass and KMS key deletion

| Stack | Account | Repo | Apply role's managed policies |
|---|---|---|---|
| dns | shared-infra | oss-monorepo | AmazonRoute53FullAccess |
| site | shared-infra | oss-monorepo | PowerUserAccess |
| saas-starter, edge-api, email-ops, listing-lens, shift-roster, retail-pilot-intel, ai-first-markets | apps | oss-monorepo | PowerUserAccess |
| payments | payments | **private-monorepo** | PowerUserAccess |

**IAM names.** Each key in `stacks` must be the stack's directory name, its
state key's first segment and the start of every IAM name it creates. The
exception is `iam_prefixes`. A prefix must contain the stack's name and never
start with `gha`; no stack uses it yet. Payments' Paddle receiver is
`payments-paddle-webhook` (`modules/app-paddle-webhook`'s `role_name`, set
the same in private-monorepo `infra/aws/payments`), and `stacks/saas-starter`
(`payments_sender_role_name`) accepts queue messages only from that name, so
the two defaults change together or not at all. The test `apply_roles_cover_the_names_their_stacks_create`
holds one real role name per stack. Add one when a stack gains a role.

**Not yet CI-ready:** `edge-api` and `email-ops` read the management
account's `org/` (and email-ops' `email/`) state for account IDs and SES
outputs. Their apps CI roles cannot read the management bucket, so until those
reads become variables they keep applying with the management credentials
(their README's default, `OrganizationAccountAccessRole`).

`PowerUserAccess` excludes IAM, Organizations and Account management. A
stack that needs less should say so in its README, and the narrower list
lands in `variables.tf` here.

**Payments.** No role in the payments account trusts the public repository.
A validation refuses such a stack, a test checks every payments trust
policy, and the payments state is in the payments account. What remains:
`github-apply`, through `OrganizationAccountAccessRole`, can still
administer every member account. AWS Organizations works that way, and this
stack does not change it.

## A workload stack's backend and CI

```hcl
# backend.hcl for stack "site" (shared-infra)
bucket       = "<shared-infra account id>-tofu-state-us-east-2"
key          = "site/terraform.tfstate"
region       = "us-east-2"
```

Single-account mode: every workload stack's state is in one bucket,
`<account id>-tofu-state-workloads-<region>` (key alias
`alias/tofu-state-workloads`), apart from the bootstrap's
`<account id>-tofu-state-<region>`, which the workload boundary keeps the
workload roles from writing. Payments has no roles here in that mode: its
isolation from this public repository is a separate account plus an RCP,
and one account has neither.

```yaml
permissions: { id-token: write, contents: read }
steps:
  - uses: aws-actions/configure-aws-credentials@7474bc4690e29a8392af63c5b98e7449536d5c3a # v4.3.1
    with:
      role-to-assume: arn:aws:iam::<account>:role/gha-oss-monorepo-site-plan  # -apply on main in aws-prod
      aws-region: us-east-2
  - run: tofu plan -lock=false   # the plan role cannot write the lock
```

## Apply

Apply it after `org` and `baseline`, with the management credentials
(`github-apply`) like those two. It reads `org/terraform.tfstate` for the
account IDs:

```sh
tofu init -backend-config=... -backend-config=key=github-oidc/terraform.tfstate
tofu apply -var state_bucket=<management state bucket>
```

Adding it to `.github/workflows/priv-aws-apply.yml`'s stack order (after
`baseline`) is a control-plane change for the owner.

## Verify

`tofu init -backend=false && tofu validate && tofu test`. The tests check:
- plan roles trust only pull requests, apply roles only `aws-prod`, and the
  findings reader only `main`
- no subject contains a wildcard
- payments trusts only the private repository, and no other account trusts it
- payments state lives in the payments account
- the boundary's denials are present
- `CreateRole` works only with the boundary
- IAM writes are limited to the stack's prefixes, and state writes to the stack's own key
- each stack's apply role covers a role name that stack really creates
  (payments: `payments-paddle-webhook`, and nothing named `saas-starter-*`)
- a prefix that does not contain its stack's name is refused
