# Monorepo Developer Workflow & Quality Policy

This document outlines the standard ongoing development, security, reliability, and testability practices for all projects in this monorepo.

It implements [the repository engineering principles](../ENGINEERING-PRINCIPLES.md).
The governing philosophy is: **if it is not tested, it is broken**.

---

## 1. Local Developer Setup & Pre-Push Quality Gate

All work follows the risk tiers, short-lived branch model, browser/UI test
requirements, and independent agent review protocol in
[Quality engineering and release policy](QUALITY-ENGINEERING.md). Direct pushes
to a release branch are not a development workflow.

### Before coding

For every material change, record the intended customer outcome and acceptance
criteria, trust/data boundaries, failure and rollback behavior, test strategy,
observability, privacy/ethical implications, and the decision supported by any
new usage or satisfaction measurement. Bug fixes should begin with a failing
regression test. High-risk work requires a threat model or FMEA proportional to
the risk.

### Quick Start: Install Pre-Push Hooks
To ensure security policy scans and verification checks run automatically before every `git push`, run:

```bash
bash scripts/security/install-hooks.sh
```

### Manual Local Verification
Before opening a Pull Request or pushing changes to `main`, run the monorepo verification suite:

```bash
bash scripts/dev-verify.sh
```

This command runs, without swallowing failures:
- Repository security policy scan (`scripts/security/scan-repository.sh`) to prevent accidental commits of secrets, `.env` files, or un-rendered credentials.
- CI and scanner contract tests.
- Workflow and shell linting when `actionlint` and `shellcheck` are installed.
- Terraform formatting and initialized validation.
- Each active venture's typecheck, lint, tests, and production build where defined.

### Vulnerability roadmap integrity

`scripts/security-scan.sh` regenerates `SECURITY_ROADMAP.md`, which is the
release gate, so it must never mistake a broken scan for a clean one. It audits
each package with the manager its lockfile implies — `npm` for
`package-lock.json`, `pnpm` for `pnpm-lock.yaml` — and skips only what is
provably covered elsewhere: pnpm workspace members and packages that declare no
dependencies.

Anything it cannot audit — a missing lockfile, an unreachable registry, an
unparseable report — is an audit gap. On any gap the scan leaves the roadmap
untouched, prints what it could not audit, and exits non-zero. Install
dependencies and restore registry access before re-running; committing a
roadmap produced by an incomplete scan silently erases tracked findings.

### Test and coverage contract

- Add meaningful unit, contract/integration, and end-to-end or smoke coverage at
  the lowest effective layer. Test failures, boundaries, authorization, abuse,
  migration, recovery, and accessibility as applicable.
- Changed code may not reduce coverage. Production ventures target 90%
  line/function/statement and 85% branch coverage; critical security, money,
  privacy, migration, and integrity paths target 95% line and 90% branch.
- A passing percentage does not replace useful assertions or real dependency
  tests. Database behavior uses the real engine; release smoke tests use the
  exact promoted image digest.
- Flakes and skipped checks are tracked defects. Quarantine and policy/scanner
  exceptions require an owner, issue, justification, compensating control, and
  expiry.
- Tier 2/3 user-visible changes include deterministic real-browser journeys,
  responsive and keyboard coverage, accessibility scanning plus manual review,
  and reviewed screenshots/traces for every changed state. Production
  applications run critical journeys both in pull-request CI and against the
  immutable candidate.

---

## 2. CI/CD Pipeline & Automated Security Controls

Every Pull Request and push to `main` triggers automated CI gates:

### Security & Compliance (`.gitea/workflows/security.yml`)
- **Action Pinning**: All third-party Gitea Actions are pinned to immutable commit SHAs with release tags in comments. Enforced by `platform/ci/test/workflow-action-pinning.test.mjs`, which fails on any `uses:` that is not `owner/repo@<40-hex>` with a version comment. `actionlint` does not check this, so until that test existed the claim was unverified and `uses: actions/checkout@v4` would have passed every gate.
- **Repository Policy Scan**: Scans tracked files for tracked `.env`, credentials, private keys, or unresolved merge conflicts.
- **Trivy Scanner**: Audits dependencies, IaC (Terraform/K8s) configurations, and secret patterns.
- **Gitleaks**: Scans complete Git history for exposed credentials with redacted evidence.
- **Trivy**: Scans dependencies and infrastructure configuration for high/critical findings.
- **Lockfile audits**: Blocks on high/critical npm or pnpm advisories.
- **Required evolution**: SAST, license policy, SBOM/provenance, container and
  published-image scanning become required gates per the engineering roadmap.
  Scanner findings are fixed and regression-protected, not broadly suppressed.

### Runtime smoke testing (`scripts/smoke-test.sh`)
- Run only after a deployment controller reports the intended immutable image healthy.
- Validates endpoint reachability, content, health/readiness, and runtime security headers.
- It is deliberately not attached to a build-only workflow: testing the old production release does not validate the newly built artifact.

---

## 3. Security Ownership & Triage Policy

- **Code Ownership (`.gitea/CODEOWNERS`)**: Changes to `.gitea/workflows/`, `platform/terraform/`, `platform/k8s/`, or security scripts require approval from designated security & infrastructure owners.
- **Triage SLA**:
  - **Critical Findings**: Must be resolved immediately; blocks production deployments.
  - **High Findings**: Must be resolved within 7 days or risk-accepted with an owner and expiration in `SECURITY_ROADMAP.md`.

---

## 4. Review, release, and evidence

A change is reviewable only when its description includes acceptance criteria,
test and scan results, coverage effect, migrations/data impact, telemetry and
privacy impact, rollout/rollback, and known limitations. Reviewers challenge
missing negative tests and measurements, not only code style.

CI builds one immutable full-SHA artifact and records its digest. CD changes
Git-tracked desired state; Argo CD reconciles it. CI does not use mutable tags
or hold broad cluster credentials. A release is done only after migration,
readiness, smoke/security, data-quality, and customer-journey checks pass for
that digest. Emergency manual changes are recorded and reconciled to Git.

The implementing agent first reviews its final diff against the acceptance
criteria and looks for untested failure paths. A separate agent run or human
then reviews independently and tries to falsify the implementation and tests.
Material follow-up changes invalidate the earlier approval. Tier 3 changes also
require accountable owner approval.

The required repository settings are pull requests, current blocking checks,
required approvals, dismissal of stale approvals, and protected production
environments. Their current live status must be audited; documentation and
CODEOWNERS do not prove that provider-side enforcement is enabled.
A deploy job must depend on the gate that produced the candidate; independently
triggered CI and deploy workflows are races. Missing browser tooling, fixtures,
visual baselines, or test reports fail closed.

---

## 5. Operate, learn, and improve

- Define and version SLIs/SLOs, error budgets, dashboards, alerts, runbooks,
  retention rules, and recovery procedures with the service.
- Review availability, latency, correctness, task success, DORA measures,
  MTTD/MTTR, change failure, flakes, escaped defects, capacity, cost, scanner
  remediation, and restore evidence on a regular cadence.
- Instrument product hypotheses with minimal governed event schemas and data
  quality tests. Measure task success and failure, time to value, retention,
  accessibility, performance, and support burden.
- Gather optional, accessible, non-leading customer feedback using contextual
  CSAT/effort measures, open text, interviews, support and churn themes. Report
  sample size, response rate, uncertainty, and selection bias, then close the
  loop with customers where appropriate.
- Collect only data needed for a declared lawful and ethical purpose. Document
  ownership, classification, notice/consent, access, retention, opt-out and
  deletion. Do not use dark patterns, covert surveillance, sensitive inference,
  or discriminatory/manipulative experiments.
