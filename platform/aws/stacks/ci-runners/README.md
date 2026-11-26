# ci-runners: GitHub Actions runners for private-monorepo on AWS CodeBuild

**Why.** Since 2026-11-24 ~23:00 UTC GitHub has assigned no hosted runner to
any job in `Duncan-Haywood/private-monorepo`: every job ends in seconds with
no runner and no steps, deploys included. The owner will not change that
GitHub account (2026-11-26: "not happening"). Self-hosted runners do not use
GitHub's hosted minutes, and CodeBuild bills each job's compute to AWS, the
one provider (owner, 2026-11-24).

**What.** In the shared-infra account:

| Resource | Purpose |
|---|---|
| `aws_codeconnections_connection.github` | GitHub access through the AWS Connector GitHub App; no stored token |
| `aws_codebuild_project.ci["private-monorepo-ci"]` | default runner, unprivileged |
| `aws_codebuild_project.ci["private-monorepo-ci-docker"]` | privileged runner, only for jobs with service containers (`grants-aws`'s Postgres) |
| `aws_codebuild_webhook.ci[*]` | one build per queued workflow job (`WORKFLOW_JOB_QUEUED`); created once `connection_ready = true` |
| role `codebuild-private-monorepo-ci` | only its own log group, the one connection and the stack's key |
| KMS key + log group | encrypted job logs, 30 days |

Each job gets a fresh build that registers as a runner, runs that one job and
is discarded. Spend is bounded by `concurrent_build_limit` (4) ×
`build_timeout_minutes` (60) per project, inside the shared-infra budget
(stacks/spend). No price is quoted here: read CodeBuild's pricing page for the
compute type before raising either limit.

The stack refuses `Duncan-Haywood/oss-monorepo`: a public repository's fork
PRs could run their code on a self-hosted runner.

## How a job uses it

The private repository's workflows pick the runner from a repository
variable, so the switch is one setting and undoing it is deleting it:

```yaml
runs-on: ${{ vars.CODEBUILD_RUNNER != '' && format('codebuild-{0}-{1}-{2}', vars.CODEBUILD_RUNNER, github.run_id, github.run_attempt) || 'ubuntu-latest' }}
```

Jobs with `services:` use `vars.CODEBUILD_RUNNER_DOCKER` the same way.

## Turning it on (owner steps marked)

1. First apply (`priv-aws-apply.yml`) creates the connection as `PENDING`; the
   run summary prints its status.
2. **Owner, once:** AWS console, shared-infra account → Developer Tools →
   Settings → Connections → `github-private-monorepo-ci` → *Update pending
   connection*, and install the AWS Connector app on `private-monorepo` only.
   AWS allows no API for this step.
3. An agent sets `connection_ready = true` (default in `variables.tf`) in a
   PR once the summary reads `AVAILABLE`; the next apply creates the webhooks.
4. **Owner, once:** on private-monorepo, set the Actions variables
   `CODEBUILD_RUNNER=private-monorepo-ci` and
   `CODEBUILD_RUNNER_DOCKER=private-monorepo-ci-docker`
   (`platform/aws/github/configure.sh --private-ci` does both). Jobs move to
   AWS on their next run; deleting the variables moves them back.

## Not verified yet

- That the `aws_codestarconnections_connection` data source accepts the
  `codeconnections` ARN (used only for the status output).
- That GitHub dispatches jobs to self-hosted runners while this account gets
  no hosted runners. GitHub documents self-hosted runners as free of hosted
  minutes and spending limits; if the account is blocked for another reason,
  self-hosted jobs may be blocked too. The first job after step 4 settles it.
