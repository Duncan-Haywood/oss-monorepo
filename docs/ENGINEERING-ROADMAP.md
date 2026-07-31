# Engineering systems roadmap

This roadmap turns [the engineering principles](../ENGINEERING-PRINCIPLES.md)
into measurable repository-wide controls. Each item needs an owner, issue,
evidence, and completion date before it can be marked done.

## Now: establish and enforce the baseline

- [ ] Inventory every active venture's verify commands, test types, coverage,
  production path, data classes, security boundaries, telemetry, and owner.
- [ ] Make one fail-closed `verify` command per active venture the local and CI
  contract; remove swallowed failures and undocumented test exclusions.
- [ ] Publish coverage reports in CI, capture current baselines, ratchet changed
  code upward, then meet the repository targets without low-value assertions.
- [ ] Require regression tests for fixes and negative authorization/input tests
  for public APIs and server actions.
- [ ] Make repository policy, secret history, SAST, SCA/license, IaC, container,
  and image scanning required checks; repair the current failing security jobs.
- [ ] Protect `main` in Gitea: required checks and review, no force push, no
  deletion, and least-privilege Actions tokens and isolated runners.
- [ ] Define an owner and expiry for every suppression, quarantine, skipped
  check, accepted vulnerability, and policy exception.

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
