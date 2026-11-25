# github-oidc: CI roles for every workload stack

Applied from management by the foundation role (environment
`aws-foundation`); chains into `OrganizationAccountAccessRole` in `security`,
`shared-infra`, `apps` and `payments`. Needs `bootstrap`, `org` and
`baseline` applied first (it reads their outputs).

## What it creates

In each account that hosts a stack: the GitHub OIDC provider (management's
comes from the CloudFormation seed), a `workload-boundary` permissions
boundary, and per stack:

| Role | Trusted subject | Can |
|---|---|---|
| `gha-<repo>-<stack>-plan` | `repo:Duncan-Haywood/<repo>:pull_request` | `ReadOnlyAccess`; read its own and the shared stacks' state; never write, never read secrets |
| `gha-<repo>-<stack>-apply` | `repo:Duncan-Haywood/<repo>:environment:aws-prod` | its managed policies (table below); write its own state only; create and edit IAM roles and policies named `<stack>-*`, and only with the boundary attached |
| `gha-oss-monorepo-findings-read` (security) | `repo:Duncan-Haywood/oss-monorepo:ref:refs/heads/main` | receive and delete messages on the findings queue |

The boundary caps every role a workload creates: no IAM users or keys, no
OIDC or SAML providers, no Organizations, Account or Identity Center calls,
no touching `gha-*` roles or the boundary itself, no object-lock bypass or KMS
key deletion.

| Stack | Account | Repo | Managed policies on apply |
|---|---|---|---|
| spend-guards | management | oss-monorepo | Billing job function + budgets, Cost Explorer, SNS, Lambda, EventBridge, logs; SCP-only Organizations writes (kill switch) |
| client-accounts | management | oss-monorepo | create/move accounts, cost reads; `sts:AssumeRole` only into accounts under the Clients OU |
| dns | shared-infra | oss-monorepo | AmazonRoute53FullAccess |
| site, edge, email | shared-infra | oss-monorepo | PowerUserAccess |
| saas-starter, products | apps | oss-monorepo | PowerUserAccess |
| payments | payments | **private-monorepo** | PowerUserAccess |

`PowerUserAccess` excludes IAM, Organizations and Account management; with
the boundary and the SCPs, an apply role can build its own workload but not
widen its own access. Narrow these once each stack is written: a sibling stack
lists what it needs in its README and the change lands in `variables.tf`
here.

**Payments.** A validation refuses any stack in the payments account whose
repository is not `private-monorepo`; the tests check that every payments role
trusts only that repository and that no other account trusts it; the org
stack's RCP refuses public-repository tokens in the Payments OU whatever a
trust policy says. Residual risk, stated plainly: the foundation role (public
repository, `aws-foundation` environment, owner-approved) administers every
account through the management account, as AWS Organizations requires.

## How CI uses it

```yaml
permissions: { id-token: write, contents: read }
steps:
  - uses: aws-actions/configure-aws-credentials@7474bc4690e29a8392af63c5b98e7449536d5c3a # v4.3.1
    with:
      role-to-assume: arn:aws:iam::<account>:role/gha-oss-monorepo-<stack>-plan   # -apply on main, environment aws-prod
      aws-region: us-east-1
  - run: tofu plan -lock=false   # plans never take the lock
```

## Apply

```sh
../bootstrap/backend-config.sh github-oidc > backend.hcl
tofu init -backend-config=backend.hcl
tofu apply -var "state_bucket=$(sed -n 's/^bucket = "\(.*\)"$/\1/p' backend.hcl)"
```

## Verify

`tofu test` checks: plan roles trust only pull requests, apply roles only the
`aws-prod` environment, the findings reader only main; no wildcard subjects;
payments trusts only the private repository and nothing else does; the
boundary's denials; `CreateRole` only with the boundary; IAM only on the
stack's prefix; state writes only to the stack's own prefix; client-accounts
only into the Clients OU. Checkov skips on the boundary policy are inline
(its `Allow *` is the ceiling, not a grant).
