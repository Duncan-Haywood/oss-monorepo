# Engineering systems roadmap

This roadmap turns [the engineering principles](../ENGINEERING-PRINCIPLES.md)
into measurable repository-wide controls. Each item needs an owner, issue,
evidence, and completion date before it can be marked done.

## Now: establish and enforce the baseline

- [ ] Retrofit every production UI with a deterministic Playwright critical-
  journey suite on pull requests and the immutable candidate. Owner: QA and
  venture owner. Priority order: Pairwise, homepage, AI-First Markets, then all
  other production UIs. Required coverage includes primary happy paths,
  validation and dependency failures, auth/authorization where present,
  persistence/reload, mobile and desktop layouts, keyboard navigation,
  accessibility scans plus manual checks, and reviewed visual artifacts.
  Automatic production promotion for the three named services is blocked in
  their workflows until this is complete; temporary releases require a tracked,
  owner-approved manual exception under `docs/QUALITY-ENGINEERING.md`.
- [ ] Configure and verify Gitea branch/environment protection: pull requests
  only for release branches, current required checks, stale approval dismissal,
  CODEOWNERS, one independent approval for Tier 2, two including an accountable
  owner for Tier 3, and protected production secrets. Owner: infrastructure.
  Retain an exported/screenshot evidence record and audit after workflow changes
  and quarterly; repository YAML cannot prove provider-side settings are active.

- [x] Inventory every active venture's verify commands, test types, coverage,
  production path, data classes, security boundaries, telemetry, and owner.
- [x] Make one fail-closed `verify` command per active venture the local and CI
  contract; remove swallowed failures and undocumented test exclusions.
- [ ] Publish coverage reports in CI, capture current baselines, ratchet changed
  code upward, then meet the repository targets without low-value assertions.
  Not started, and worse than not started: the only automated check carrying the
  word coverage is `scripts/ci/test-engineering-policy.sh:42`, which greps
  `ENGINEERING-PRINCIPLES.md` for the sentence stating the 90% floor. Deleting
  every test in the repository leaves it green. No coverage tool is installed
  anywhere (`@vitest/coverage-v8`, `c8`, `nyc`, `pytest-cov` all absent), no
  venture defines a `coverage` script, and no `VENTURE.yaml` carries the
  `engineering.coverage` block `platform/VENTURE.template.yaml` declares. Start
  with a measured baseline and a two-directional ratchet — fail below it and
  fail when it is exceeded without being raised — modelled on the `count` field
  in `platform/exception-register.yaml`. Do not start at 90%.
- [ ] Require regression tests for fixes and negative authorization/input tests
  for public APIs and server actions.
  Partial, 2026-08-01, owner duncan. Done in one venture, and the way it was
  done is the point. `print-atelier` had 7 API routes and no route-level
  authorization tests; `ventures/print-atelier/tests/api-route-guard-contract.test.ts`
  now enumerates every handler under `src/app/api` and fails unless it either
  calls `requireOperator` or is listed as public with a stated reason. Writing
  that contract found four unguarded handlers that reading the code had missed,
  including `GET /api/stripe/webhook` and `GET /api/stripe/checkout` reporting
  which secrets are configured — see SEC-019 in
  [the security audit log](SECURITY_AUDIT_LOG.md). The negative tests live in
  `tests/operator-route-authorization.test.ts` and each fails against the
  pre-fix handler.
  Measured surface elsewhere, 2026-08-01: `quick-pick-survey` 30 routes with
  integration tests covering auth, admin, trials, couple and usage;
  `local-site-studio` 9 routes with a `route.test.ts` beside each and ~20
  server-action tests; `ai-first-markets` 3 routes and
  `photo-editing/docs-site` 3 routes, both with none. Neither of those two has
  an equivalent guard contract, so the same class of gap is unmeasured there.
  The generalizable piece is the contract shape, not the specific guard: a
  venture-local test that makes every new route declare an auth posture. Nothing
  yet holds a venture to having one.
- [ ] Make repository policy, secret history, SAST, SCA/license, IaC, container,
  and image scanning required checks; repair the current failing security jobs.
  Partial, 2026-07-31, owner duncan. Repaired: the CI engine no longer reports
  PASSED for a component it never verified — a missing scanner script, a stale
  catalog directory, a moved Python test path and a failing `terraform validate`
  were all skip-and-pass, and `platform/ci/test/fail-closed.test.mjs` now covers
  each. `.gitea/workflows/security.yml` fails if a run retains no evidence.
  SAST landed 2026-08-01, owner duncan: `scripts/ci/sast_scan.py` runs Semgrep
  (`p/default`, 1074 rules) and Bandit from the `sast` job in
  `.gitea/workflows/security.yml`, fails closed on any unregistered finding, and
  is held to its register in both directions by `platform/sast-baseline.yaml`.
  Process, remediation order and limits in [SAST](SAST.md). Two things there are
  worth carrying forward rather than reading as done. First, the obvious
  configuration was nearly inert: `p/javascript` + `p/typescript` + `p/nextjs`
  loaded 74 rules for a TypeScript file and detected neither `eval(userInput)`
  nor `exec("ls " + userInput)`, so it would have been a green SAST check over
  710 TypeScript files finding almost nothing. Second, 191 of the 195 findings
  are registered as `inherited` — counted and count-locked, not assessed —
  because claiming otherwise would have been false; 19 are error-severity and
  the highest-value group is 6 GitHub Actions script injections.
  Still open: Trivy runs `vuln,misconfig` but not `license`, no SBOM, no
  container or published-image scanning. `license` specifically must not be
  enabled by just adding the scanner: measured 2026-08-01, it returns zero
  findings because it cannot read licences without `node_modules` installed and
  reports clean anyway, so in the current `scan` job it would be a permanently
  green check that measures nothing.
  The host gap that kept named checks from executing in CI is closed
  (`316d814`): `.gitea/workflows/ci-cd.yml` installed only Node, so gate 1
  failed on a clean runner and `set -euo pipefail` in `scripts/verify-all.sh`
  aborted before the Dagger engine ran at all — none of the fail-closed work
  above actually bound in CI. It now installs Python 3.11 with
  `requirements-ci.txt`, the Pairwise and print-atelier venture dependencies,
  ShellCheck, actionlint (checksum-verified) and Terraform, and a missing
  linter fails instead of printing a skip notice.
  `platform/ci/test/ci-workflow-tooling.test.mjs` holds the workflow to the
  tools `scripts/test-ci.sh` invokes, so a new gate needing new tooling fails
  until the install step exists. Not yet verified on a real runner — the
  evidence is local (`bash scripts/test-ci.sh` green, actionlint and ShellCheck
  clean, each tooling pattern mutation-checked); a first CI run is what would
  confirm it.
- [ ] Protect `main` in Gitea: required checks and review, no force push, no
  deletion, and least-privilege Actions tokens and isolated runners.
  Blocked on Gitea server administration; nothing in this repository can
  complete it. Prepared 2026-07-31: `.gitea/CODEOWNERS` had a rule for
  `/SECURITY-ROADMAP.md`, which matches no file, so the vulnerability register
  was unowned; the CI engine, the exception register and the audit scripts were
  unowned too. Corrected and held by
  `platform/ci/test/codeowners-contract.test.mjs`. This is inert until
  protection is switched on. `platform/terraform/` still has no Gitea provider
  or `branch_protection` resource, and there is one Act Runner, so the split
  between untrusted verification and protected release runners does not exist.
- [x] Define an owner and expiry for every suppression, quarantine, skipped
  check, accepted vulnerability, and policy exception.
  Owner duncan, completed 2026-07-31. `platform/exception-register.yaml` holds
  the register, `scripts/ci/audit_exceptions.py` fails closed on unregistered,
  expired, and stale entries, and `tests/test_audit_exceptions.py` runs it as a
  repository contract. Process and remediation plan in
  [the exception register](EXCEPTION-REGISTER.md); accepted vulnerabilities
  remain tracked as `SEC-xxx` in [the security audit log](SECURITY_AUDIT_LOG.md).

## Next 30 days: prove releases and operations

- [ ] Standardize full-SHA image builds, SBOMs, signatures/provenance, digest
  promotion, vulnerability gates, and Argo CD reconciliation for every service.
- [ ] Add preview/staging integration and end-to-end tests for critical customer
  journeys; keep production smoke checks bound to the promoted digest.
- [ ] Define per-service SLIs/SLOs and error budgets; version dashboards, alerts,
  recording rules, runbooks, and ownership beside the services.
- [ ] Add tested backup/restore, migration rollback/forward recovery, load and
  capacity checks, graceful degradation, and zero-unavailable rollout evidence.
- [ ] Establish DORA, MTTD/MTTR, flaky-test, escaped-defect, scanner-remediation,
  cost, saturation, and recovery-test scorecards with trend review.
- [ ] Add dependency update automation that opens small, tested Gitea changes
  and prioritizes supported framework/security releases.

## Next 60 days: responsible product learning

- [ ] Give every venture a versioned measurement plan mapping hypotheses to
  events, outcomes, decision thresholds, owners, and sunset dates.
- [ ] Create governed event schemas and automated data-quality tests for
  validity, completeness, uniqueness, freshness, lineage, and deletion.
- [ ] Add accessible, optional contextual feedback, customer-effort/CSAT where
  appropriate, open-text feedback, and cancellation/churn reason collection.
- [ ] Build feedback operations: acknowledgement, taxonomy, owner, linkage to
  roadmap decisions, response SLA, bias/sample reporting, and closed-loop notice.
- [ ] Complete data inventories, lawful-basis/purpose records, retention and
  deletion tests, access reviews, DPIAs/threat models where required, and
  analytics redaction/pseudonymization.
- [ ] Add accessibility, fairness, experimentation, and statistical-integrity
  review gates for products whose decisions or measurements can materially
  affect people.

## Ongoing operating cadence

- Review release health, SLO/error-budget status, incidents, customer outcomes,
  feedback, security debt, data quality, and cost weekly for active services.
- Run quarterly access, restore, disaster-recovery, dependency, scanner,
  telemetry-retention, and customer-feedback quality reviews.
- Run FMEA/hazard reviews before critical new flows and after material incidents.
- Remove metrics, events, dashboards, dependencies, flags, and controls that no
  longer inform a decision or mitigate a documented risk.
- Update this roadmap from measured gaps. Do not mark a control complete based
  only on configuration; retain execution evidence.

## Definition of done for roadmap controls

A control is done only when it is versioned, reviewed, automatically tested
where feasible, exercised in the real environment, observable, owned, and has
a documented failure/rollback path. A dashboard without a decision cadence or
a scanner without remediation is not a completed control.
