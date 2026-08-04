# Engineering principles

These principles apply to every venture, shared platform component, automation,
data pipeline, and infrastructure change in this repository. They are release
criteria, not aspirations.

## 1. If it is not tested, it is broken

- Every behavior change includes automated tests that would fail without the
  change. Bug fixes begin with a regression test when practicable.
- Test user-visible behavior and contracts, not implementation trivia. Cover
  success, boundary, failure, authorization, recovery, migration, and rollback
  paths in proportion to risk.
- Changed code must not reduce coverage. Active production ventures target at
  least 90% line/function/statement coverage and 85% branch coverage; critical
  security, money, privacy, migration, and data-integrity paths target 95% line
  and 90% branch coverage. Coverage is a floor, never a substitute for useful
  assertions, integration tests, or exploratory testing.
- Unit tests provide fast feedback; contract and integration tests prove real
  boundaries; end-to-end and post-deployment smoke tests prove the deployable
  artifact. Database code is tested against the real database engine.
- Every user-visible change is tested in a real browser across its critical
  happy, failure, recovery, responsive, keyboard, and accessibility states.
  Stable visual regression tests and reviewer-inspected artifacts protect
  layout and content; automated accessibility scans do not replace manual
  interaction review.
- Flaky tests are defects. Quarantine requires an owner, issue, reason, and
  expiry; retries must not turn a failure into a pass without recording it.
- Test code, fixtures, CI logic, migrations, monitoring rules, and recovery
  procedures are production code and receive the same review.

## 2. Shift quality and security left

- Define acceptance criteria, risks, observability, privacy, abuse cases, and
  test strategy before implementation. Prefer small, reversible changes.
- Local verification and pull-request CI run formatting, type checks, lint,
  tests, production builds, policy checks, and relevant integration tests.
- Use short-lived branches and protected pull requests. Direct release-branch
  pushes are prohibited. The implementer reviews the final diff, and a separate
  agent run or human independently tries to falsify material changes; an
  implementer cannot be the only reviewer of their own work.
- Secure defaults are mandatory: runtime input validation, server-side
  authorization, least privilege, safe output handling, secret isolation,
  bounded resources, and deny-by-default network and data access.
- CI scans source and history for secrets; dependencies and licenses for supply
  chain risk; application code for unsafe patterns; and IaC, containers, and
  images for misconfiguration and vulnerabilities. Generate an SBOM and retain
  provenance for released artifacts.
- Critical findings block immediately. High findings block release unless a
  time-limited, owner-approved risk acceptance documents compensating controls.
  Fix root causes, rotate exposed credentials, add regression protection, and
  verify the remediation. Never silence a scanner merely to make CI green.
- Threat models and negative/abuse tests are required for authentication,
  authorization, payments, personal data, uploads, webhooks, agent execution,
  and other material trust boundaries.

## 3. Everything as code

- Application code, infrastructure, desired deployment state, schemas,
  migrations, policies, CI/CD, alerts, dashboards, SLOs, runbooks, feature-flag
  defaults, data-retention rules, and recovery procedures are versioned,
  reviewed, testable, and reproducible.
- Manual production changes are emergency exceptions. Record and reconcile any
  emergency change back into Git immediately; otherwise drift is a defect.
- Configuration is validated before merge. Secrets are references to managed
  values, never plaintext in Git, generated artifacts, logs, or client bundles.

## 4. Immutable CI and declarative GitOps

- CI produces one immutable artifact from a full Git SHA, scans and tests that
  artifact, records its digest and provenance, and promotes that exact digest.
  Mutable tags such as `latest` are conveniences only and are never deployment
  inputs.
- CI has the minimum permissions needed to publish and update desired state; it
  does not imperatively administer production clusters.
- Argo CD reconciles Git-tracked desired state with automated health checks,
  drift detection, self-healing, safe rollout policy, and auditable rollback.
- Database migrations are forward-safe, isolated, backed up where required,
  and tested before traffic reaches new code. A deployment is complete only
  after readiness, smoke, security, data-integrity, and telemetry checks pass.
- Merge is not promotion. Production release jobs consume the exact candidate
  that passed all required checks and explicitly depend on that evidence; a
  parallel workflow triggered by the same push is not a dependency. Production
  UI services without a blocking candidate browser suite are not eligible for
  automatic promotion.

## 5. Reliability is engineered and measured

- Define service-level indicators and objectives for availability, latency,
  correctness, freshness, durability, and task success. Error budgets govern
  release pace and reliability investment.
- Use industrial engineering methods: map the system, identify constraints,
  apply FMEA/hazard analysis to critical flows, measure capability and
  variance, eliminate recurring failure modes, and verify controls.
- Track deployment frequency, lead time, change-failure rate, rollback rate,
  mean time to detect/recover, flaky-test rate, escaped defects, capacity,
  saturation, cost per useful transaction, and recovery-test success.
- Production changes include actionable structured telemetry with bounded
  cardinality, redaction, alert ownership, and a runbook. Logs are not a
  substitute for metrics, traces, health checks, or user-outcome measurements.
- Load, degradation, backup/restore, and disaster-recovery tests are scheduled
  according to risk. Incidents produce blameless reviews, owned actions, and
  regression tests or monitoring improvements.

## 6. Measure product use responsibly

- Measure whether customers achieve their intended outcome: activation, task
  completion and failure, time to value, retention, feature usefulness,
  accessibility, performance, and support burden. Instrument hypotheses before
  launch and use decision thresholds rather than collecting data indefinitely.
- Gather customer satisfaction through contextual CSAT or customer-effort
  measures, relationship-level measures such as NPS only when appropriate,
  open-text feedback, interviews, support themes, cancellations, and churn
  reasons. Report sample size, response rate, segment coverage, uncertainty,
  and known bias; never present directional feedback as universal truth.
- Make feedback easy, optional, accessible, and non-retaliatory. Close the loop:
  acknowledge it, categorize it, connect it to a decision or issue, and tell
  customers what changed when appropriate.

## 7. Law, privacy, and ethics constrain measurement

- Collect the minimum data needed for a declared purpose and lawful basis.
  Provide clear notice and consent where required, honor opt-out and deletion,
  define retention and access controls, and prefer aggregate or pseudonymous
  analysis. Never put secrets or unnecessary personal data in telemetry.
- Do not use deceptive consent, dark patterns, covert surveillance, sensitive
  inference, discriminatory segmentation, or manipulative experimentation.
  Protect children and vulnerable people with heightened review.
- Privacy, security, accessibility, statistical integrity, and research ethics
  are go-live gates. Consult qualified legal/privacy reviewers where the law or
  risk requires it; repository policy is not a claim of legal compliance.
- Analytics datasets, events, dashboards, experiments, and models have owners,
  schemas, quality checks, lineage, retention, and documented access. Validate
  accuracy, completeness, timeliness, representativeness, and deletion behavior.

## 8. Evidence over confidence

- A green build proves only the checks that ran. A release claim cites the Git
  SHA, artifact digest, test and scan results, deployment health, and relevant
  user/data checks.
- Exceptions are explicit, narrow, time-limited, and owned. "Not applicable"
  includes evidence. Unmeasured risk is recorded rather than assumed away.
- Roadmap work is prioritized by customer harm, security exposure, reliability
  risk, learning value, and cost of delay—not feature count or activity.

See [the development workflow](docs/DEV-WORKFLOW.md),
[quality engineering and release policy](docs/QUALITY-ENGINEERING.md),
[CI/CD architecture](docs/CI-CD-ARCHITECTURE.md), [security policy](SECURITY.md),
and [engineering roadmap](docs/ENGINEERING-ROADMAP.md) for implementation.
