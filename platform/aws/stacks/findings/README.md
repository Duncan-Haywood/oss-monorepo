# stacks/findings: AWS findings into the file queue

Writes AWS findings into the same file queue as the code-scanning alerts
(`.github/workflows/priv-security-alert-queue.yml`, branch
`security-alerts`), as §7 of the cloud-provider report asks.

- **security account:** an EventBridge rule takes Security Hub's HIGH and
  CRITICAL findings and puts them in the SQS queue `security-findings`
  (SSE on, TLS only, 14-day retention). Security Hub aggregates GuardDuty,
  Config, Access Analyzer and Inspector findings, from both regions.
- **`ci/findings-to-files.yml`:** a draft workflow for the owner (control
  plane). Every hour it assumes `gha-oss-monorepo-findings-read`
  (`../github-oidc`), drains the queue, and writes one Markdown file per
  finding under `aws-findings/` on `security-alerts`. It needs no secret.
  It skips until the Actions variable `AWS_SECURITY_ACCOUNT_ID` is set.

Apply after `baseline` (Security Hub's aggregator must exist), with the
management credentials, like `baseline`. `tofu test` checks the severity
filter, the encryption, and that the queue name matches the reader role's
grant.
