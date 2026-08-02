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
  Partial, 2026-08-01, owner duncan. Pairwise, the first of the three, has one:
  `ventures/quick-pick-survey/e2e/` plus `playwright.config.ts`, 17 journeys
  across a desktop and a phone viewport, run by a `journeys` job in
  `.gitea/workflows/pairwise-ci.yml` that `container` now waits on — so a red
  journey stops an image being *built*, not merely promoted. Before this there
  was no Playwright anywhere in the repository. Covered: anonymous entry and
  primary task completion, validation refusal, persistence across reload, undo,
  keyboard voting, dependency-failure states, anonymous authorization against
  every admin handler, cross-origin refusal, and axe scans of both screens the
  journey passes through. It drives a production build and takes its base URL
  from `PLAYWRIGHT_BASE_URL`, so the same specs can run against the candidate;
  nothing under `e2e/` imports application code. `retries: 0`, deliberately —
  Playwright exits 0 on a test that passes on attempt two, which is the
  opposite of what this policy asks for — with traces, video and screenshots
  retained and uploaded on failure.

  **What writing it found is the reason the item exists.** Four votes produced
  "2 answered" on the insights screen, behind four HTTP 200s. `trials/next`
  hands a shown-but-unanswered pair back for 30 minutes so a reload does not
  mint a new row; the runner saves an answer in the background and asks for the
  next pair in the same tick. Both requests are therefore in flight together and
  the next-question one normally lands first, while the row it is about to skip
  still reads `result: null`. The identical pair came back, the person answered
  it again, and `trials/answer` correctly refused to apply one answer twice —
  replying `{ok: true, alreadyAnswered: true}`, which the client treats as
  success. Not a fast-tapper edge case: a race between two simultaneous
  requests that resolved the wrong way on essentially every answer. Roughly half
  of all taps in the only venture serving production traffic were discarded, the
  Glicko-2 ratings and every insight were computed from half the data, and
  nothing anywhere reported it. Fixed in `54733cc` by naming the in-flight trial
  so both fetchers exclude it, symmetric across `trials/next` and
  `financial-trials/next`, with the reload behaviour left intact. Guarded twice:
  by the journey that found it and by
  `src/app/api/trials/pendingReuse.integration.test.ts`, which runs in the
  existing `database` job and so binds where no browser exists — mutation-checked
  by removing the exclusion, which fails the two in-flight cases and leaves the
  two reload cases green.

  The floor beneath this control, rather than the control itself.
  2026-08-01, owner duncan: the homepage — one of the three named
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

  Still open, and this item stays unchecked until all of it is done: the
  homepage and AI-First Markets have no journey suite; Pairwise's own suite has
  no authenticated, couple-linking, or admin-dashboard journey, no visual
  regression evidence, and no candidate-side run — `PLAYWRIGHT_BASE_URL` is
  supported but no workflow points it at the promoted digest yet. The accessible
  coverage is an automated axe scan of two screens at two viewports, which is
  roughly a third of what a person would find, and the manual checks the policy
  asks for are still owed. Automatic promotion therefore remains blocked for all
  three services, unchanged by this work.
  None of that homepage work is live, 2026-08-02, owner duncan, and checking
  why found a further defect. `origin/main` is at `a4b8f23` from 2026-07-31; 58
  commits — the homepage suite, its five fixes, SEC-019 through SEC-021, the CI
  runner repairs — sit on unpushed local branches. Production still serves the
  5806-byte `app.js` from `origin/main` rather than HEAD's 6310-byte version, so
  the `rel="noopener"`, focus-restore, `aria-hidden` and double-bullet fixes are
  all still absent from the live site. Nothing in the repository measures this:
  no lead-time, deployment-frequency or unshipped-work signal exists, which is
  the DORA item in the 30-day section below, still not started.
  The defect that gap exposed is SEC-022. Production does not serve the
  container image's web root at all — `web-portal-web-service` mounts the
  `marisstella-homepage-files` ConfigMap over `/usr/share/nginx/html` with no
  `items:` selector, so the public file set is whatever
  `platform/ci/deploy-homepage.sh` passes to `--from-file`, and one of those
  four keys was `Dockerfile`. `https://marisstella.dev/Dockerfile` returned the
  repository's Dockerfile byte-for-byte. So SEC-021's `.dockerignore` fix, and
  the test holding it, govern an artifact production overwrites — a remediation
  recorded against the surface that was easiest to reason about rather than the
  one that ships. `platform/ci/test/homepage-release-surface.test.mjs` now
  allow-lists the deploy script's publish list, mutation-checked seven ways.
  The class this belongs to is one past "a gate that cannot fail": a *fix* that
  cannot fix, with a passing test over the wrong artifact as its evidence.
  It also depends on cluster state the repository does not hold — the
  Deployment and ConfigMap are created imperatively and have no desired state
  in git, so the missing `items:` selector is visible only from `kubectl`.
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
  The command exists per venture; two of them were not executing, 2026-08-01,
  owner duncan. The box stays checked for what it claims — one declared
  fail-closed command each — but "remove swallowed failures" was not true, and
  the failures were swallowed in three distinct ways worth naming, because each
  is a different hole:
  1. **A gate declared and never called.** `verify-component.sh` has had a
     `local-site-studio` arm — typecheck, lint, test, build — that no workflow
     invoked, so 125 test files, 1214 tests and a production Next.js build were
     verified nowhere. `.gitea/workflows/local-site-studio-ci.yml` now calls it.
     All four steps pass, so the gate went in green.
  2. **A gate called and failing, reported by nothing.** `ai-first-markets` runs
     `verify-component.sh` from both its CI and deploy workflows, and it was red
     on every clean checkout: `npm run typecheck` rejected the `.ts` import
     extensions its own `--experimental-strip-types` runner requires (TS5097),
     and `npm test` failed five assertions across two drifted contracts.
     `ciContract` grepped the deploy workflow for gate commands that d3b61a2 had
     *moved into the shared script*, reading a tightened deploy path as a deleted
     one; it now follows that indirection and is mutation-checked five ways.
     `routeAuthPosture` declared an `/api/subscribe` handler that had not been
     committed alongside the contract declaring it — three failures that d999424
     resolved from the other end by landing the route. Worth recording which way
     that was fixed: the contract was right and the code caught up to it, which
     is what the contract is for. Typecheck, lint, test and build now pass
     together for this venture for the first time.
  3. **A gate that could not see the files it vouched for.** npm runs scripts
     under `sh`, which has no globstar, so an unquoted `src/**/*.test.ts` reaches
     the runner as `src/*/*.test.ts` — one directory level. `ai-first-markets`
     collected its three tests only by their happening to sit at that depth;
     a deliberately failing test placed at `src/app/deep/` was skipped in silence
     and the suite exited 0. The script is quoted now, and the posture-coverage
     control models the difference rather than reading every `**` as globstar,
     so it can no longer vouch for a contract `sh` cannot reach.
  What generalizes: a venture-local test proves nothing until you have checked
  which CI path executes it, and a contract that asserts on the *text* of a
  workflow breaks when the gate it guards is moved rather than removed. Follow
  the indirection instead. The fourth and last known instance of the class was
  `ventures/ai-engineering-academy/site`, registered in the Dagger catalog as
  running `test` while its package.json defined no such script, so the engine
  skipped it and `platform/ci`'s own suite failed on that assertion. Its
  `test.mjs` existed and passed; declaring it as the `test` script closed the
  gap, and the platform/ci suite is 38/38.
  No instance of this class is known to remain open, which is a weaker claim
  than it sounds: nothing generalizes the check beyond route-posture contracts
  and the catalog's own `test`-script assertion, so a fifth would be found the
  same way these were — by running each venture suite at a clean HEAD and
  naming which CI path executes it.
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
  Partial, 2026-08-02, owner duncan. That ratchet exists:
  `platform/coverage-baseline.yaml` declares two components,
  `scripts/ci/coverage_ratchet.py` measures and compares them in both
  directions, and `tests/test_coverage_ratchet.py` runs it as a repository
  contract. Nine ventures remain unmeasured, so the paragraph above is still the
  plan for them.
  What the first ratcheting of that gate did is the part worth keeping.
  Both floors were raised the same day they were set — `platform-ci` 52.11 ->
  87.60 and `print-atelier` 91.70 -> 94.07 — each recorded as measured, each
  measured honestly, and both wrong. Node 22 counts a component's own test files
  as covered source and Node 24 stopped doing so. `platform-ci` has one source
  file of 805 lines; the report it was raised onto held 13 files and 3436 lines,
  which is `wc -l test/*.test.mjs src/pipeline.mjs` exactly. Test files execute
  themselves, so 2631 lines of near-total coverage averaged with 805 lines of
  63.98% and produced an apparent 87.60%. `print-atelier`'s 113 files were its 54
  source files plus all 59 of `tests/`. The real figures are 63.98/77.78/78.72
  and 91.81/87.53/79.76, and the engine that decides whether every other
  component passes is again the least covered thing in the repository.
  Three things generalize from it. First, the gate's verdict depended on the
  runner: `.gitea/workflows/ci-cd.yml` pins Node 22 and laptops run newer, so the
  same commit passed in CI and failed locally. Every Node coverage command now
  passes `--test-coverage-include=src/**`, verified to produce identical figures
  on 22.22.3 and 26.4.0, and a contract test fails any node-test component that
  omits it. Second, a percentage is a ratio and every check here compared
  ratios, so nothing could see the denominator move. Each component now declares
  `measured.files` and `measured.lines` and the audit checks them, which is the
  same shape as `count` in the exception register — the evidence was already
  written down in a comment beside the baseline, and being prose it was compared
  to nothing. Third, the dangerous direction is the quiet one: source silently
  dropping out of a report makes coverage *rise*, and a two-directional ratchet
  then reports `baseline-stale` and invites someone to raise the floor over a
  shrinking surface. The basis check is what distinguishes those two cases, and
  no percentage-only check ever can.
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
  is in-flight work to finish rather than a defect in the venture.
  Affected-path detection is fixed, 2026-08-01, owner duncan. The entry above
  described the defect as narrowing to the last commit of a push. That was true
  of the code read on its own, but not of what ran in CI, and the difference
  mattered more than the original claim. `.gitea/workflows/ci-cd.yml` checked out
  with `actions/checkout`'s default `fetch-depth: 1`, so `HEAD~1` did not exist in
  the checkout at all: the diff threw on every run, the `catch` returned null, and
  `resolveAffectedComponents` read null as "verify everything". Confirmed against a
  real `--depth 1` clone, where `HEAD~1` is an unknown revision. So the engine was
  never selecting anything in CI — it ran the full catalog every time while
  logging `Affected Path Detection: Found N affected component(s)`, which read as
  a considered selection and was in fact the catalog length. The narrowing defect
  was real only where full history existed, which is local runs.
  `getChangedFiles` now resolves an explicit range instead of a default: the
  branch diff on pull requests, and on pushes `before...HEAD` from the event
  payload, which spans every commit the push carried rather than its last one.
  `HEAD~1` is gone as a fallback and a test fails if it returns. Every path that
  cannot resolve a base — new ref with a zero SHA, force-pushed tip that is no
  longer present, shallow checkout, unreadable event payload, no event at all —
  widens to the full catalog and says why, so the log distinguishes a selection
  from a fallback. The checkout now uses `fetch-depth: 0`, and a test binds that
  depth to the engine's need for history, since detection is inert without it.
  Closing this made a latent hole live and it had to be closed in the same
  change: with detection finally resolving, a changed file that matches no
  component and no global trigger selects *nothing*, and an empty selection
  reports as a pass. `tests/`, `pytest.ini`, `requirements-ci.txt`,
  `platform/coverage-baseline.yaml` and `platform/exception-register.yaml` all
  behaved that way — each decides how every component is verified — and are now
  global triggers held by a test that also fails if one is renamed away.
  Eleven tests in `platform/ci/test/affected-path-detection.test.mjs`, each
  mutation-checked. Not yet observed on a real runner: the push payload shape is
  taken from Gitea's documented GitHub compatibility, and if it turns out to
  differ the resolver returns null and the behaviour is the full run that has
  been happening all along. A first CI run is what would confirm it, and the
  honest log line is what will show it.
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
- [ ] Hold customer-facing copy to behaviour the code actually performs. Owner
  duncan, opened 2026-08-01.
  Every claim a venture makes to a visitor — a confirmation, a capability, a
  price, a statistic, a security posture — is either backed by something the
  code does or it is a false statement. The repository has no control for this,
  and an audit of the four ventures with a live or near-live surface found it
  is the most common defect class in the portfolio, ahead of anything found by
  the security or coverage work. The diagnostic that finds them: ask what would
  be *observably different* if the handler were replaced with `return ok()`.
  Three fixed on 2026-08-01, each with a test that fails against the pre-fix
  code:
  Pairwise shared every insight card with the literal link
  `https://quickpick.app` while the product is served from
  `pairwise.marisstella.dev`, so every recipient of the one artefact that
  reaches non-users landed off-product; and `alignmentPct` defaulted to `85`,
  so a couple with no computed overlap could share "85% Aligned" as their own
  result. `ShareInsightModal.test.tsx`, mutation-checked (5 of 7 fail on the
  pre-fix component).
  Listing Lens sold a $19 shoot including "sky replacement where needed, and
  perspective/vertical correction applied to every kept shot"; `enhance.ts`
  does `.rotate().resize().normalise().sharpen().jpeg()` and never did either.
  `process/mls-compliance.ts` already said so in as many words — the venture
  knew, and nothing connected the two files. Both named edits are also
  disclosure-triggering in strict states (CA AB 723, NY, TX), so the copy
  advertised an edit nobody can perform *and* a delivery this venture does not
  produce. `pipeline/src/offer-claims.test.ts` scans the three customer-facing
  copy files for five restricted alterations, each carrying the code signal in
  `enhance.ts` that would make its claim true, so building the capability
  unlocks the claim by itself — a contract, not a word blocklist.
  Listing Lens docs claimed "Private — Cloudflare Access" on every page while
  answering an unauthenticated GET with 200 and the whole site. SEC-021; fixed
  by ordering the policy before the publish and probing the result from
  outside.
  Still open, found by the same audit and not yet fixed:
  Pairwise's Double-Date Challenge builds a link to `/couple/challenge/<code>`
  and `src/app/couple/` contains only `page.tsx`, so every challenge link
  404s — and `route.test.ts` asserts the exact dead URL, pinning it. Its
  `$9/month` "Pairwise Together" tier has no payment path anywhere in the
  venture (no Stripe dependency, no subscription model), carries a "Most
  Popular" badge on a plan nobody can buy, lists an "Exportable Value Summary
  PDF" that no code generates, and gates none of its features. Its feedback
  widget answers "that helps tune the next insight for you" while
  `insightFeedback` is never read by insight generation, and
  `FeedbackWidget.test.tsx` asserts that string. `api/og/couple-card/route.tsx`
  renders the same dead host and defaults to an invented "88%" — left alone
  because the concurrent agent has uncommitted changes in it.
  AI Engineering Academy's checkpoint answers "Checkpoint passed! Schema
  structure verified. Portfolio point awarded (+25 pts)" to any input over ten
  characters, storing nothing and validating nothing; its sandbox prints a
  hardcoded trace ending "12/12 passing" with no model or execution behind it,
  and `site/test.mjs` asserts both handlers are *present*, so the suite
  currently protects them. Its "Always Free" tier lists four features that do
  not exist. Its waitlist flow, by contrast, is the model to copy — it refuses
  to claim delivery ("your application has not been sent yet") and a test
  guards against regression.
  `retail-pilot-intel`'s `VENTURE.yaml` declares
  `production: https://retail-pilot-intel.pages.dev`, which does not resolve;
  the venture has no Cloudflare project, config or workflow, and its portal is
  built in CI and uploaded as an artifact only. Its `kill_criteria` are
  measured against a "sales demo availability" that was never achieved. Not
  corrected here: `portfolio/router/README.md` reserves venture-metadata
  changes for the portfolio owner.
  The generalizable control is the `offer-claims.test.ts` shape — enumerate the
  copy surface, enumerate the claims that need a capability, and name the code
  signal that grants each one. It is not yet a repository-wide control, and it
  should become one; a venture-local habit is what let all of the above ship.

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
  The cost side has no measurement to trend yet, and the two months on record
  each fail in a different way. `portfolio/ledger/YYYY-MM.yaml` is the only
  record of what the portfolio spends, and `router.py` sums it into cumulative
  spend to decay each venture's next explore grant, so a wrong figure moves
  budget. `2026-07` records $127.26 divided seven ways — detected since
  2026-08-01 by `validate_ledger.py`'s `uniform-spend`. `2026-08` fails the same
  way one shape further on and is harder to see, because the figures differ from
  each other and therefore look metered: six of its nine entries record, to the
  cent, the budget `portfolio/ALLOCATION_REPORT.md` grants that venture
  (`$40.00`, `$30.00`, `$28.50`, `$24.22`, `$20.59`, `$6.80`), three more sit
  within fifteen cents of it, and the month was written on its second day —
  before the spend it describes could have happened. That closes the allocator
  into a loop reading its own output as evidence: a venture that drew nothing
  decays as if it had spent its whole grant.
  Detected as of 2026-08-02, owner duncan, by `spend-mirrors-allocation` in
  `portfolio/router/validate_ledger.py`, which compares each entry against the
  budget the allocator is on record as granting *that same venture* across both
  generated artefacts, reads the report by its header row rather than by cell
  position, and treats a source that exists but yields no allocation as an
  error — a parser that quietly matches nothing would leave this passing forever.
  Mutation-checked twelve ways. It reports and does not repair: the ledger is
  append-only, so the finding is a warning and the CI gate is still not
  `--strict`. **Neither month can be reconstructed, so the portfolio still has
  no measured cost signal at all** — the scorecard this item asks for cannot be
  built until one month closes with spend metered per venture as it is drawn.
  What the check cannot see is stated in `portfolio/ledger/README.md`: a venture
  that genuinely draws its whole grant, and figures nudged a few cents off it.
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
