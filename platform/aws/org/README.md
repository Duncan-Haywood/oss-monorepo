# org: the Organization, accounts, guardrails and Identity Center

Applied from the management account by `gha-oss-monorepo-foundation-apply`
(environment `aws-foundation`, owner-approved). Nothing here is applied yet.

## What it creates

- **The Organization** (all features), trusted access for CloudTrail, Config,
  GuardDuty, Security Hub, Access Analyzer, Identity Center, IAM and Account
  Management; SCPs and RCPs enabled.
- **Centralised root access**: member accounts are created with no root
  password or keys (`aws_iam_organizations_features`).
- **OUs** `Security`, `Infrastructure`, `Workloads`, `Payments`, `Sandbox`,
  `Clients` (the last for `client-accounts`).
- **Six member accounts**: `log-archive`, `security` (Security OU),
  `shared-infra`, `apps`, `payments` (alone in its OU), `sandbox`. Emails come
  from `account_email_template` (the `AWS_ACCOUNT_EMAIL_TEMPLATE` Actions
  variable). `prevent_destroy`; `close_on_deletion = false`.
- **SCPs** (root: 3 of the 5 slots, one is AWS's `FullAWSAccess`):
  - `protect-security-baseline`: nobody but `OrganizationAccountAccessRole`
    (which only the management account can enter) may stop or delete
    CloudTrail, GuardDuty, Config, Security Hub, Access Analyzer, change
    account Block Public Access or default EBS encryption, or touch `gha-*`
    roles and OIDC providers;
  - `deny-unapproved-regions`: regional services only in us-east-1 and
    us-west-2;
  - `deny-exit-root-and-long-lived-keys`: no leaving the organization, no root
    user actions, no IAM users, access keys, login profiles or service
    credentials.
  - On the Security OU, `protect-log-archive`: no shortening object-lock
    retention or editing log buckets.
- **RCPs**: `data-perimeter` (root) makes S3, KMS, Secrets Manager and SQS
  answer only this organization's principals and AWS services;
  `payments-no-public-repo` (Payments OU) refuses any web-identity token whose
  subject is this public repository.
- **Identity Center** (once `identity_center_enabled = true`): permission sets
  `AdministratorAccess` (1 h sessions) and `ReadOnlyAccess` (4 h), groups
  `platform-admins` and `platform-readonly`, each assigned in all seven
  accounts.

## Things siblings should know

- No IAM users or access keys anywhere. SES SMTP credentials are IAM user
  keys, so `email` sends through the SES API with a role; if SMTP is ever
  unavoidable it needs a written exception here.
- Any new region needs a change here first.
- The data perimeter blocks anonymous S3 access: serve the site through
  CloudFront with Origin Access Control (the service principal is allowed),
  never a public bucket or S3 website endpoint.

## Apply

```sh
../bootstrap/backend-config.sh org > backend.hcl
tofu init -backend-config=backend.hcl
tofu apply -var "account_email_template=$AWS_ACCOUNT_EMAIL_TEMPLATE" \
           -var "identity_center_enabled=${AWS_IDENTITY_CENTER_ENABLED:-false}"
```

Then re-apply `bootstrap` with `-var organization_id=...` (see its README).

## What the owner must do

Set `AWS_ACCOUNT_EMAIL_TEMPLATE` before the first apply; enable Identity
Center after it, set `AWS_IDENTITY_CENTER_ENABLED=true`, add yourself to
`platform-admins`, and require MFA at every sign-in (turnover steps 3 and 6 in
`../README.md`). AWS may cap a new organization at a few accounts; if account
creation fails with a quota error, request an increase in Service Quotas
(Organizations, "Default maximum number of accounts").

## Verify

`tofu init -backend=false && tofu validate && tofu test`; `checkov -d .`.
The tests cover: six accounts in the right OUs, root credentials off, every
required SCP denial, the 5,120-character policy limit, the per-target SCP
count, exemptions naming only the baseline role, both RCPs, and Identity
Center waiting for the owner.
