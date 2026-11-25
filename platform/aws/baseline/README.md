# baseline: organization-wide security services

Applied from management by the foundation role; chains into
`OrganizationAccountAccessRole` in `log-archive` and `security`. Then
`account/apply-all.sh` applies the per-account settings.

## What it creates

| Where | What |
|---|---|
| log-archive | `oss-monorepo-logs-<id>-us-east-1`: object lock (GOVERNANCE 365 days by default; `log_object_lock_mode = "COMPLIANCE"` once retention is settled), versioning, SSE-KMS with a rotating key, Block Public Access, TLS-only, Glacier IR after 90 days, deleted after 730 |
| management | the organization CloudTrail: every account, every region, global events, log-file validation, KMS, plus S3 data events on the state bucket |
| management | delegated admin for GuardDuty, Security Hub, Config and Access Analyzer to `security` |
| security, both regions | GuardDuty, auto-enabled for every account (S3 protection on; runtime, EKS and malware scanning off until a workload needs them); an organization Access Analyzer |
| security | Security Hub central configuration: AWS Foundational Security Best Practices + CIS 3.0 in every account, us-west-2 aggregated into us-east-1 |
| security | a Config aggregator over the organization |
| security | `oss-monorepo-security-findings` SQS queue fed by EventBridge with HIGH and CRITICAL Security Hub findings |

`account/` + `../modules/account-baseline` add, in every account and both
regions: account-level S3 Block Public Access, default EBS encryption under
an account KMS key, and an AWS Config recorder delivering to the log bucket.

## Findings into files

Findings go into the same file queue the code-scanning alerts use
(`.github/workflows/priv-security-alert-queue.yml`, branch
`security-alerts`). `ci/findings-to-files.yml` is a **draft** workflow for the
owner (control plane): hourly, it assumes `gha-oss-monorepo-findings-read`
(created by `github-oidc`), drains the queue, and writes one Markdown file per
finding under `aws-findings/` on that branch. It needs no secret.

## Apply

```sh
../bootstrap/backend-config.sh baseline > backend.hcl
tofu init -backend-config=backend.hcl
tofu apply -var "state_bucket=$(sed -n 's/^bucket = "\(.*\)"$/\1/p' backend.hcl)"
./account/apply-all.sh          # PLAN=1 for a dry run
```

## Cost (us-east-1 list prices; small at this scale)

CloudTrail's first management-event copy is free; the S3 data events cover
one low-traffic bucket. GuardDuty, Security Hub and Config bill per event,
check and configuration item, so empty accounts cost cents to a few dollars a
month each. The spend-guards stack sets the budget that would notice
otherwise.

## Verify

`tofu test` here, in `account/` and in `../modules/account-baseline/`;
`checkov -d .`. Skips (inline): access logging on the log bucket itself,
event notifications, cross-region replication, CloudWatch Logs and SNS for
the trail, each with its reason.
