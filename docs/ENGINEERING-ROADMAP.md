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
  Not started for any service; what follows is the floor beneath it, not this
  control. 2026-08-01, owner duncan: the homepage — one of the three named
  services — had no gate of any kind. Its three declared gates were
  `node -e 'console.log("Marisstella homepage build verified")'` and the same
  for `lint` and `test`; `VENTURE_CATALOG` ran `build`, it exited 0, and the
  component was reported PASSED for as long as it had existed. The workflow
  never ran the scripts at all. So the promotion block above was guarding a
  service whose *existing* verification was zero, which is a different and
  cheaper problem than the missing browser suite, and it is now fixed:
  `portfolio/marisstella-homepage/test/` holds 27 dependency-free tests that
  execute `app.js` in a `node:vm` against a fixture derived from `index.html`'s
  own `data-filter`/`data-category`/`openModal` values, plus a static contract
  over ids, anchors, accessible names, asset existence, the nginx security
  headers, and the venture count the hero claims against the number of cards the
  grid shows. Mutation-checked thirteen ways. It found five defects, all fixed:
  two `target="_blank"` links without `rel="noopener"`, `nginx.conf` and
  `package.json` published to the public web root (SEC-021 in
  [the security audit log](SECURITY_AUDIT_LOG.md)), keyboard focus lost when a
  venture brief closed, a decorative glyph missing `aria-hidden`, and every
  brief list item drawing a second bullet beside the browser's own.
  This is **not** the Playwright control: it runs against the working tree, not
  the immutable candidate; it drives a fake DOM, so it cannot see layout,
  contrast, or real focus rings; and it is not wired into the promotion gate.
  The real-browser check that found the doubled bullet was manual.
  The generalizable half is `platform/ci/test/gate-substance.test.mjs`, which
  fails when any gate the engine runs — or any `test`/`build`/`lint`/`typecheck`
  script under `ventures/`, `portfolio/` or `platform/` — either cannot fail or
  discards its own failure with `|| true`. Every control we had asked whether a
  gate was *declared* and whether it was *reachable*; this one was both, and
  neither question could tell it from a passing suite.
- [ ] Configure and verify Gitea branch/environment protection: pull requests
  only for release branches, current required checks, stale approval dismissal,
  CODEOWNERS, one independent approval for Tier 2, two including an accountable
  owner for Tier 3, and protected production secrets. Owner: infrastructure.
  Retain an exported/screenshot evidence record and audit after workflow changes
  and quarterly; repository YAML cannot prove provider-side settings are active.
  Partial live enforcement verified 2026-08-01 through the Gitea API: `main`
  blocks direct pushes and outdated branches, requires one approval, dismisses
  stale approvals, and blocks rejected or pending official reviews. Still open:
  required status checks await a real pull-request run to establish exact
  context names, production environment approvers/secrets remain unverified,
  Tier 3 cannot yet require two approvals by path/risk tier, and runner
  isolation remains unverified.

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
  `photo-editing/docs-site` 4 routes, both with none. Neither of those two has
  an equivalent guard contract, so the same class of gap is unmeasured there.
  The generalizable piece is the contract shape, not the specific guard: a
  venture-local test that makes every new route declare an auth posture.
  Both of those two now have one, 2026-08-01, owner duncan, in
  `src/lib/routeAuthPosture.test.ts` under each venture. Both guard in
  middleware rather than in handlers, so the contract checks reachability — it
  enumerates the handlers, requires each to declare `public` (with a reason
  naming what makes anonymous access safe) or `guarded`, and then checks that
  declaration against what the middleware actually does with the path. In
  `docs-site` it imports the real `isPublicPath` so it cannot drift; in
  `ai-first-markets` that function is module-local, so it mirrors the rule and
  fails if the original stops matching the mirrored shape. Both fail if the
  middleware matcher stops covering `/api`, and both fail on an empty route
  scan. Each was mutation-checked: a new undeclared handler, a narrowed
  `PUBLIC_PATHS`, a changed matching rule, an `/api`-excluding matcher and a
  moved app directory each fail the intended test and no other.
  Writing the `docs-site` one found SEC-020 — `isPublicPath` exempted
  `startsWith("/api/health")`, which matches siblings and not only children.
  That venture had no test of any kind under `src` before this.
  The contract shape is now a control rather than a habit, 2026-08-01, owner
  duncan. `platform/ci/test/route-auth-posture-coverage.test.mjs` scans
  `ventures/` for route handlers and requires every app package serving one to
  hold either a registered contract or a registered gap. A registered contract
  must exist, must read the app directory off disk rather than assert against a
  hard-coded list, must belong to a package the CI catalog runs `test` for, and
  must be matched by that package's real test script — both script shapes in
  this repository are modelled and an unrecognized one fails rather than being
  assumed to run. A registered gap carries owner, issue, reason, an expiry
  capped at 180 days, and an exact count of undeclared handlers that fails both
  when the unreviewed surface grows and when the register goes stale, as `count`
  does in `platform/exception-register.yaml`. Mutation-checked eleven ways.
  `local-site-studio` has a contract as of the same date, in
  `src/lib/routeAuthPosture.test.ts`. It is the first of the four whose guard is
  neither middleware nor proxy: `src/proxy.ts` matches nearly every path but
  gates only `/dashboard`, so every `/api` handler is reached anonymously and
  the guard is the handler's own `requireOperatorAuth()` call, with no
  deny-by-default behind it. The contract requires each handler to declare
  `public` with a stated reason or `operator`, checks an `operator` handler
  actually calls the guard and acts on the result, and asserts the proxy still
  leaves `/api` alone — if that changes, "declared public" stops meaning
  "reachable" and the test says so. All 10 handlers were reviewed and no
  unguarded operator surface was found; the eight public ones authenticate the
  request (Stripe signature, HMAC unsubscribe token, checkout session id) or
  serve anonymous visitors by design.
  Completed: `quick-pick-survey`'s contract in `src/lib/routeAuthPosture.test.ts` covers all 32 handlers, leaving 0 registered gaps in `platform/ci/test/route-auth-posture-coverage.test.mjs`. All 5 route-bearing ventures across the monorepo now hold active, verified route authorization posture contracts. `print-atelier`'s page routes, as distinct from its API routes, remain outside contracts (coverage control currently scans for `route.*` modules).
- [ ] Make repository policy, secret history, SAST, SCA/license, IaC, container,
  and image scanning required checks; repair the current failing security jobs.
  Partial, 2026-07-31, owner duncan. Repaired: the CI engine no longer reports
  PASSED for a component it never verified — a missing scanner script, a stale
  catalog directory, a moved Python test path and a failing `terraform validate`
  were all skip-and-pass, and `platform/ci/test/fail-closed.test.mjs` now covers
  each. `.gitea/workflows/security.yml` fails if a run retains no evidence.
  Still open: no SAST (Semgrep/CodeQL/Bandit), Trivy runs `vuln,misconfig` but
  not `license`, no SBOM, no container or published-image scanning.
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
  The same gap one level down is closed, 2026-08-01, owner duncan (`10cbb14`).
  The workflow installs venture dependencies for `quick-pick-survey` and
  `print-atelier` only, because those two are needed by gates in
  `scripts/test-ci.sh` that run before the engine. `verifyPnpmHost` installed the
  pnpm workspace when `node_modules` was absent; `verifyNodeHost` installed
  nothing, so every other Node component in `VENTURE_CATALOG` reached
  `npm run <script>` on a clean runner with no dependencies and died on
  ERR_MODULE_NOT_FOUND — a dependency failure reported as a broken component,
  firing precisely when affected-path detection selected a changed venture. The
  engine now installs what it verifies, with `npm ci` where a lockfile exists.
  `platform/ci/test/venture-dependency-install.test.mjs` holds it, mutation-checked
  four ways, and also requires a committed lockfile for every Node component that
  declares dependencies.
  What that turned up is the point: five components had no CI run that had ever
  executed their suites, and all five verify end to end at `HEAD` once the engine
  can install them — `ai-first-markets`, `photo-editing/docs-site`,
  `ai-engineering-academy/site`, `real-estate-agent-photo-app`, whose five test
  files were confirmed by moving `node_modules` aside and watching the component
  fail before this change and pass after it, and `local-site-studio`, the largest
  suite in the repository at 125 files and 1214 tests. So the work these gates
  were never running was passing work; the gap was the runner, not the ventures.
  Verified for `local-site-studio` in a detached worktree at `HEAD` with a real
  `npm ci`, because a `node_modules` symlink no longer suffices — Turbopack
  rejects one that points outside the project root.
  Two things remain open, neither belonging to this change. `next build` fails in
  the current working tree, from the concurrent agent's uncommitted `webpack`
  config: Next.js 16 makes Turbopack the default and errors when a `webpack`
  config appears with no `turbopack` config beside it. `HEAD` builds clean, so this
  is in-flight work to finish rather than a defect in the venture. And the engine
  reaching a venture at all still depends on affected-path detection, which is
  narrower than it reads: `getChangedFiles` defaults to `HEAD~1`, so a push
  carrying several commits verifies only the components the *last* commit touched.
  A change to a venture in the middle of a push, followed by a docs-only commit,
  selects nothing. `GITHUB_BASE_REF` widens this to the full branch diff on pull
  requests, so the hole is on direct pushes — which is also where the weakest
  review is. Fixing it means diffing the push range rather than one commit, and
  wants a real runner to confirm what the Gitea event actually provides.
- [ ] Protect `main` in Gitea: required checks and review, no force push, no
  deletion, and least-privilege Actions tokens and isolated runners.
  Partially configured live on 2026-08-01 as recorded above; required status
  contexts and environment/runner controls remain open. Prepared 2026-07-31:
  `.gitea/CODEOWNERS` had a rule for
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
  Started 2026-08-02, owner duncan: one of the four DORA metrics, and the one
  that was making every other control on this roadmap worth nothing. Production
  runs `origin/main`. Measured that morning it was at `a4b8f23` from 2026-07-31
  while **119 commits sat across 29 local branches**, and the unshipped set
  touched all 11 ventures plus `platform/`, `portfolio/`, `scripts/` and
  `.gitea/` — every deployable component in the repository was running without
  its committed changes. Nothing measured this: a grep for
  `dora|lead.time|deployment.frequency` hit only the sentence above asking for
  it. So a "Fixed" row in [the security audit log](SECURITY_AUDIT_LOG.md) and a
  green pipeline could both be true while the live service ran a fortnight-old
  commit, and on the same morning both were.
  `scripts/ci/release_lag.py` and `platform/release-lag-budget.yaml` ratchet the
  gap two-directionally, in the shape `count` uses in
  `platform/exception-register.yaml`: above the declared budget fails because the
  pile grew, and more than `slack_commits` below it fails because work shipped
  and the budget went stale. The declared numbers are themselves capped and the
  budget expires, so it cannot be widened into permanent silence.
  Two things are worth carrying to the other three metrics. First, a shallow CI
  clone is reported as a **third state**, never as a pass: `actions/checkout`
  fetches one ref at depth 1, so `origin/main` does not resolve and no branch
  topology exists, and "nothing is undelivered" is trivially true there. The
  report prints `NOT MEASURABLE HERE`. Verifying that in a real depth-1 clone —
  rather than only in fixtures — is what found that the gate-substance test and
  the JSON `ok` field were both wrong in CI. Second, the commit-count dimension
  is gameable, because committing more always raises it; `max_unshipped_age_days`
  is the one only shipping can lower, and it is where the teeth are.
  46 tests, run against real temporary git repositories, mutation-checked eleven
  ways. Not done: deployment frequency, change failure rate and time to restore
  are all still unmeasured, nothing trends this over time, and the control
  reports rather than ships — pushing stays a human decision.
  It immediately paid for itself. Checking whether SEC-021's fix had reached
  production found that it could not: the homepage is served from a ConfigMap,
  not the container image, so the `.dockerignore` remediation governed an
  artifact the live site does not use. `https://marisstella.dev/Dockerfile`
  answered 200 with the build recipe while the finding was recorded as Fixed.
  Filed as SEC-022, fixed in `platform/ci/deploy-homepage.sh`, contract in
  `platform/ci/test/homepage-release-surface.test.mjs`.
- [ ] Add dependency update automation that opens small, tested Gitea changes
  and prioritizes supported framework/security releases.

## Next 60 days: responsible product learning

- [ ] Give every venture a versioned measurement plan mapping hypotheses to
  events, outcomes, decision thresholds, owners, and sunset dates.
  Prerequisite measured 2026-08-02, owner duncan: there is almost nothing to
  measure yet, and the metadata said otherwise. Three of eleven ventures
  declared a `links.production`; resolving all three found that one is real
  (`pairwise.marisstella.dev`), one was NXDOMAIN and had never been reachable
  (`retail-pilot-intel`), and one answers 200 but serves internal documentation
  behind Cloudflare Access rather than a customer surface
  (`real-estate-agent-photo-app`). Both false ones are now null with the reason
  recorded in place. So **one** venture in the portfolio has a production
  surface, against eleven the allocation report funds — a measurement plan for
  the other ten would be measuring nothing. Nothing checked this: `links` was
  free text no test resolved or compared to anything.
- [ ] Make the studio's public surface reflect the portfolio behind it.
  Started 2026-08-02, owner duncan. `marisstella.dev` is the only live,
  public, revenue-facing page in the repository — the top of funnel for every
  venture — and it had no contact route at all: no address, no form, no "work
  with us". A visitor who read all six venture briefs and wanted to buy or hire
  had to leave to find out how. Three routes now exist (header, closing
  section, footer), using the address the repository already publishes and
  tests as the studio's commercial contact on the AI Engineering Academy
  pricing page. Two dead controls went with it: the brand logo was `href="#"`,
  and the footer listed two ventures as links to this page's own `#ventures`
  anchor, beside the one real product link and indistinguishable from it.
  `portfolio/marisstella-homepage/test/shopfront-contract.test.mjs` is the
  generalizable half: it reads `ventures/*/VENTURE.yaml` and fails when a
  venture declares a production URL the homepage does not link, when the page
  advertises a destination no venture declares, when an anchor has an empty
  href, when no deliverable contact address is present, and when the footer
  offers a venture as a link that only scrolls the page. Mutation-checked seven
  ways. Not done: the contract proves a link is *present*, not that it
  *resolves* — the NXDOMAIN and private-docs findings above came from resolving
  the URLs by hand, and nothing does that on a schedule. The nav is also hidden
  below 760px with no menu replacing it, so of the three contact routes only
  the two below the fold survive on mobile.
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
