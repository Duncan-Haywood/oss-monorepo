# Quality engineering and release policy

This policy turns the repository's engineering principles into a delivery
system. Its goal is high deployment frequency with a low escaped-defect rate,
not slow batches or confidence based on review alone.

## Delivery model

- Work on a short-lived branch. Direct pushes to protected release branches are
  prohibited. Prefer changes that can be reviewed and reverted independently;
  split work that cannot receive useful review in one sitting.
- Open a draft pull request early. Record acceptance criteria, risk tier, test
  plan, rollout/rollback, and screenshots or recordings while implementation is
  still in progress. Keep the branch current with the release branch.
- Merge only through a pull request after required checks and approvals pass.
  Stale approval is dismissed after a material code change. The person or agent
  that implemented a material change cannot be its only reviewer.
- Merge to the release branch creates an immutable candidate. It does not by
  itself prove that the candidate may receive production traffic.
- Promote the exact tested digest through GitOps after candidate, migration,
  browser journey, security, and deployment checks pass. Use progressive
  delivery or a feature flag for changes whose failure cannot be made small.

Long-lived feature branches and large integration batches increase both lead
time and risk. Trunk-based development here means short-lived branches merged
frequently through protected pull requests, not direct unreviewed pushes.

## Risk tiers

Every change declares the highest applicable tier. When uncertain, use the
higher tier. Splitting a change does not reduce its aggregate risk.

| Tier | Typical change | Required evidence |
| --- | --- | --- |
| 0 | Documentation or comment only | Link/format validation and self-review |
| 1 | Internal refactor with unchanged contracts | Unit/contract tests, coverage ratchet, self-review |
| 2 | User-visible UI, API behavior, dependency, schema-compatible data change | Tier 1 plus integration tests, real-browser happy/failure journeys, accessibility and responsive UI checks, independent review |
| 3 | Authentication, authorization, money, privacy, destructive data, migration, infrastructure, release controls | Tier 2 plus negative/abuse and recovery tests, threat model or FMEA, migration/rollback rehearsal, owner review, progressive rollout |

An incident regression inherits at least the tier of the escaped behavior. Its
fix begins with a test that reproduces the failure and adds the cheapest earlier
control that would have prevented or detected it.

## Test architecture

Use layers for speed and diagnosis, but do not replace a missing layer with more
tests at another layer.

1. **Under five minutes:** formatting, type checking, lint, focused unit and
   component tests, contract/schema validation, and changed-code coverage.
2. **Before merge:** the complete affected-component suite, real dependencies,
   database migrations, integration tests, production build, security scans,
   and deterministic browser journeys.
3. **On the immutable candidate:** container/runtime smoke tests, critical
   browser journeys against the deployed candidate, migration compatibility,
   accessibility, and visual regression evidence.
4. **After progressive promotion:** health, synthetic journeys, data integrity,
   error/latency/task-success signals, and automatic halt or rollback criteria.

### End-to-end coverage

Each production application maintains a small, reliable critical-journey suite
and a broader scheduled suite. Critical journeys run on every relevant pull
request and on the exact release candidate. They cover, as applicable:

- anonymous and authenticated entry, primary task completion, persistence, and
  return/reload behavior;
- validation, empty, loading, timeout, dependency failure, permission-denied,
  expired-session, retry, cancellation, and recovery states;
- authorization across roles and tenants, direct URL/API access, and logout;
- migrations and compatibility across the currently deployed and candidate
  versions;
- analytics/telemetry emission and absence of secrets or unnecessary personal
  data, without making third-party analytics availability a test dependency.

Tests use stable user-facing locators, isolated accounts/data, deterministic
fixtures, trace/video/screenshot artifacts on failure, and no arbitrary sleeps.
Retries may diagnose a flake but the original failure remains a failed signal.

### UI and UX coverage

Every user-visible change is exercised in a real browser. The pull request
includes evidence for the changed states, not only the default happy path.

- Test representative mobile and desktop widths, zoom/text enlargement,
  keyboard-only navigation, focus order/visibility, reduced motion, and the
  supported browser matrix.
- Run automated accessibility scanning and manually verify keyboard and screen
  reader semantics for changed critical interactions. Automated scans are not
  an accessibility sign-off.
- Use reviewed visual snapshots for stable components/pages. Snapshot updates
  must be isolated, explained, and reviewed as product changes; bulk acceptance
  is prohibited.
- Assert absence of overlap, clipping, horizontal overflow, layout shift, blank
  canvases/images, unreadable contrast, and text escaping controls. Verify all
  loading, empty, error, destructive-confirmation, success, and recovery states.
- A reviewer performs task-based exploratory testing for Tier 2/3 changes and
  records the scenarios, browser/device, result, and defects found.

## Agent review protocol

An implementing agent must inspect the final diff as if reviewing another
author's change. It must compare behavior with acceptance criteria, run the
required checks, inspect browser artifacts, identify untested paths, and report
limitations. "Tests pass" is not a review.

A separate agent run or human reviewer independently reads the acceptance
criteria and diff, then tries to falsify the implementation. It focuses on
behavioral regressions, missing states, security/authorization, data loss,
accessibility, responsive layout, operability, and whether tests could pass
while the product remains broken. The reviewer must not rely on the implementer
summary as evidence and must record findings or explicitly state residual risk.

The implementer resolves findings and reruns affected checks. Material fixes
invalidate earlier review. Tier 3 changes require an accountable human/owner
approval even when multiple agents reviewed the work.

## Required deployment controls

Repository and Gitea settings are part of the system and must be checked against
code after any CI change and at least quarterly.

- Protect `main`, `master`, GitOps desired-state branches, and production
  environment configuration. Disable force pushes and deletion.
- Require pull requests, current required checks, CODEOWNERS approval where
  applicable, one independent approval for Tier 2 and two approvals including
  an accountable owner for Tier 3. Dismiss approvals after new commits.
- Release jobs depend on the successful required-check job in the same workflow
  or consume an attested candidate produced by it. Two workflows triggered by
  the same push are concurrent, not ordered; a deploy may not merely assume the
  CI workflow passed.
- Production credentials are available only to protected release jobs and
  environments. Pull-request code cannot access them.
- A production UI service without an automated candidate browser suite is not
  eligible for automatic production promotion. Until coverage is added, its
  release requires a recorded exception, manual owner approval, documented
  exploratory evidence, rollback readiness, and an expiry date.
- Required checks fail closed when tooling, browsers, fixtures, baselines,
  services, or reports are missing. Skipping or converting a check to advisory
  is a policy exception, not a CI fix.

## Speed and reliability measures

Track p50/p95 time to first useful failure, pull-request cycle time, queue time,
deployment frequency, lead time, flaky-test rate, escaped defects by journey,
change-failure/rollback rate, and MTTD/MTTR. Review them together: reliability
gained by making changes too slow is not the target.

Keep the fast lane under five minutes through affected-path selection,
parallelism, hermetic fixtures, and cache reuse. Do not gain speed by omitting a
required risk layer. Move expensive broad browser, mutation, load, recovery,
and cross-browser suites to scheduled runs only after critical affected
journeys remain blocking on each relevant change.

## Exception and incident rules

An exception names the owner, exact missing control, reason, compensating
evidence, issue, risk, and expiry. The manual release input must link the issue
and independent review/test/rollback evidence and expire within 30 days; CI
validates their shape and expiry before production credentials are used. It
cannot be self-approved and cannot be renewed without evidence that the
underlying work progressed. Protected-environment approval remains required
because field validation cannot prove the links exist or who approved the
exception.

For every escaped Tier 2/3 defect, record why unit, integration, browser,
review, candidate, and production controls did not catch it. Add a regression
test and improve the earliest effective control. Review recurring patterns
monthly and fund systemic fixes before adding more feature load.
