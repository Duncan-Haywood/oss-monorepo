# Control and revenue-path audit, 2026-08-04

Owner: duncan. Method: seven independent read-only audits run against `main` at
`7218a388`, each asked to *disprove* a control rather than confirm it. Every
finding below was substantiated by tracing a concrete call path or by mutating a
scratchpad copy and observing the control stay green. Findings that could not be
substantiated were discarded and are not listed.

Only one finding from this audit is fixed as of this document: the
`security-scan.sh` fail-open, recorded against the SCA item in
[the roadmap](ENGINEERING-ROADMAP.md). **Everything else below is open.** This
file exists so the next run acts on them instead of rediscovering them.

## The pattern this audit found

The repository's controls are, on the whole, real: several were checked hard and
found genuinely sound (`gate-contract`, `dagger-optionality`, `tests/test_sast_scan.py`,
the Node half of `dependency-audit-coverage`, local-site-studio's verify chain).
The failures cluster into one shape, and it is not "the assertion is wrong".

**The assertion is almost always right about the input it is given. The input is
the defect.** A control collects its input from a hardcoded file list, a
non-recursive directory, a filename pattern, or a single workflow directory —
and the artifact that actually ships, takes money, or reaches production falls
outside it. The control then passes truthfully over a surface nobody meant to
exclude.

Read what a control *collects* before reading what it *asserts*.

Two sub-shapes recur:

- **A vacuous glob is a passing gate.** `node --test '<glob>'` exits 0 when the
  glob matches nothing. Renaming a test directory silently disarms the suite,
  and no control inspects whether a declared gate's glob resolves.
- **The recording obligation is tested and the blocking obligation is not.** A
  test asserts a finding was written down, and asserts the run exited zero. Both
  are true of the same green run, so the missing refusal is invisible. This is
  exactly how the `security-scan.sh` fail-open survived having a test suite.

## Open findings, ranked

Severity is "what does this let through", not "how hard is the fix".

### 1. A vacuous test glob disarms the only gate on the venture in production — FIXED

Fixed by `platform/ci/test/gate-collection.test.mjs` (`a658ed57`), which resolves
every declared gate's file patterns against `git ls-files` and fails closed when
one collects nothing. Resolution is against tracked files rather than the
filesystem, because a gate green on a laptop over an untracked file collects
nothing in the clone CI checks out. Failability was proved by mutation: renaming
`portfolio/marisstella-homepage/test/` to `tests/` turns the control red and, in
the same tree, leaves the venture's own `npm test` exiting 0 over zero tests.

Note for whoever consolidates: `platform/ci/test/gate-glob-resolution.test.mjs`
(`2509a882`) was written independently against this same finding in a parallel
session. Two controls now cover it. Keep one — see the duplicate-control rule in
`docs/ENGINEERING-PRINCIPLES.md` — and do not simply delete the larger without
checking which assertions only it makes.

The original finding follows.


`scripts/test-ci.sh:71` and `platform/ci/test/gate-substance.test.mjs:47`.
`node --test <glob>` exits **0** on zero matched files (verified on Node 22).
`portfolio/marisstella-homepage/package.json`'s `"test": "node --test 'test/*.test.mjs'"`
is the only gate on the one venture with a public customer surface. Rename its
five test files and all 26 meta-gate tests stay green over zero assertions. Same
shape in `ai-first-markets`, `print-atelier`, `retail-pilot-intel`.

Fix: assert that every declared gate's glob resolves to at least one tracked
file, and fail closed when it does not.

### 2. `ventures/*/.github/workflows/` is unpoliced by every workflow control — FIXED

Fixed in `3f93986c`. All four controls now enumerate workflows with
`git ls-files -- .gitea/workflows ventures` instead of a hardcoded directory.
Measured before the change: 15 tracked venture workflow files, 60 `uses:` refs,
**none** pinned to a SHA and one — `anomalyco/opencode/github@latest` — mutable
outright. All 60 are now pinned to commit SHAs resolved with `git ls-remote`
and confirmed against the GitHub API, with the release tag in a trailing
comment. print-atelier's workflow ran `npm ci && npm run build` on Node 20
against a venture that declares typecheck+lint+test+build on 22; it now runs
all four gates individually so a failure names the gate. photo-editing's
docs-site had the same drift and got the same treatment; four Node-20 pins in
real-estate-agent-photo-app moved to 22.

Two scoping notes, both per-assertion rather than per-directory: the actionlint
checksum check stays scoped to the release this control declares, and the
coverage-component install check stays monorepo-relative because a venture
checkout cannot satisfy its paths. Both say so inline.

Still open, one layer down: `scripts/test-ci.sh:274` runs `actionlint` over
`.gitea/workflows/` only, so venture workflows are linted by nothing —
running it by hand finds two real defects. And three scheduled venture
workflows carrying repo credentials install vendor CLIs by piping an
unversioned `curl` to `bash` (`cursor-agent-grok.yml:40`,
`cursor-scheduled.yml:66`, `grok-scheduled.yml:62`); there is no published
checksum to pin, so this needs a different fix than the action pins.

The original finding follows.


Four separate controls hardcode `.gitea/workflows` as their input:
`workflow-action-pinning.test.mjs:10`, `node-version-contract.test.mjs:11`,
`ci-workflow-tooling.test.mjs:41`, `verify-contract.test.mjs:335`. There are
**15 tracked workflow files** under `ventures/*/.github/workflows/` that no
control reads, carrying roughly **60 unpinned `uses:` refs**.

Live instances, not hypotheticals:
- `ventures/local-site-studio/.github/workflows/opencode-scheduled.yml:98` uses
  `anomalyco/opencode/github@latest` — a third party's **mutable** ref in a
  scheduled workflow that also carries repo credentials and `actions/cache/save@v4`.
- `ventures/print-atelier/.github/workflows/ci.yml` runs `npm ci && npm run build`
  only, on Node 20, while `VENTURE.yaml` declares typecheck+lint+test+build and
  `.nvmrc` pins 22. **print-atelier's 749 tests do not gate print-atelier's own
  workflow.**

### 3. Swift is verified by not being installed

`platform/ci/src/pipeline.mjs:557-560` returns `true` when `command -v swift`
fails, and `platform/ci/test/host-execution.test.mjs:405` asserts that as
correct. No workflow installs Swift and `ubuntu-latest` has none, so
`range-coach` is reported verified on every CI run having compiled nothing —
permanently. Worse, `isKnownSwiftEnvironmentIssue` (`pipeline.mjs:539`) swallows
`'Invalid manifest'`, so a genuinely broken `Package.swift` also returns true.

### 4. Affected-path detection can select zero components and call it a pass

`platform/ci/src/pipeline.mjs:301`. Changes confined to `.nvmrc`,
`platform/k8s/**`, or any of eight `platform/*.yaml` registers select **0
components**; `main()` then prints `ALL CI VERIFICATION CHECKS PASSED`.
`pipeline.test.mjs:218` asserts the zero-selection result as correct, locking it
in. `.nvmrc` is the sharpest case: the file the node-version contract calls the
single source of truth can be changed and nothing is verified.

### 5. The homepage promotes to production outside the promotion policy

`homepage-ci.yml:84-96` (job `container`, `if: ref == main`) pushes
`marisstella-homepage:latest` on every merge, with no dispatch gate and no
`validate-release-exception.sh`. `platform/k8s/.../deployment.yaml:19` pins
`:latest` and the ArgoCD app syncs `HEAD` with `automated: {prune, selfHeal}`.
`production-ui-promotion-policy.test.mjs:9-25` polices the `deploy` job only, via
a three-entry hardcoded list, so this path is invisible to it. The repo already
knows this is wrong: `local-site-studio-image.yml` and `print-atelier-image.yml`
both refuse to push `:latest` and say why in comments.

Two further defects in the same control, both empirically verified by mutation:
its "validate before the privileged step" check (`:66-70`) compares
`indexOf(...) < indexOf(...)`, which is satisfied by `-1 < n` when the step is
simply **renamed**; and its shell-injection check (`:71-75`) covers one named
step and defaults to `''` when its regex misses.

### 6. Route-posture controls cannot see three real handler shapes

`scripts/ci/route_posture_contract.py:82` and both `.mjs` siblings prune
directories named `build`/`dist`/`coverage`/`out`, so an App Router route whose
**URL segment** is one of those words does not exist to the audit — verified by
adding three unguarded handlers under `/api/build`, `/api/dist`, `/api/coverage`
and watching the count stay at `9 routes / 10 handlers`. The handler regex
(`:86`) matches only `export [async] function NAME(`, so the arrow-const form
`export const DELETE = async (req) => {}` is invisible. And nothing in the
cluster reads a file not named `route.*`, so **Server Actions are entirely
unpoliced** — `local-site-studio/src/app/dashboard/leads/actions.ts` has 26, all
currently guarded, with no control that would notice a 27th that is not.

Compounding: the one control whose regex *can* see an arrow-const handler
(`route-auth-posture-coverage.test.mjs:127`) throws the number away, because both
gap tests hit `if (!entry.gap) continue;` on a registry with zero `gap:` keys.

### 7. The Python half of dependency-audit coverage cannot fail

`platform/ci/test/dependency-audit-coverage.test.mjs:118-125`. The coverage
assertion iterates `trackedLockfiles()`, which drops anything not npm/pnpm/yarn,
so no Python manifest reaches it. Proved by mutation: **replacing `EXCEPTED` with
`{}` leaves the suite 9 pass / 0 fail** — the three registered exceptions, with
owners and expiries, are validated only against themselves. `requirements-sast.txt`
is tracked, in no matrix, in no exception, and green. `go.sum`, `Cargo.lock`,
`Gemfile.lock`, `poetry.lock` are outside the glob entirely.

Related: `scripts/security-scan.sh:210` walks only `ventures/` and `portfolio/`,
so `platform/ci` can never appear in `SECURITY_ROADMAP.md`. The dashboard's
"HIGH: 67" is a lower bound by construction.

### 8. Budget and baseline files can be edited without review — FIXED

`.gitea/CODEOWNERS` has no rule matching `platform/release-lag-budget.yaml`,
`coverage-baseline.yaml`, `kill-criteria-baseline.yaml`, `sast-baseline.yaml`,
`image-release-baseline.yaml`, `image-tag-exceptions.yaml` or
`integration-debt-budget.yaml`. `codeowners-contract.test.mjs:75` checks a
five-entry hardcoded list that stops at `exception-register.yaml`. Raising a
budget or lowering a coverage floor needs no review.

This is the class the cap ratchet exists to catch, and on 2026-08-04 it did:
an edit raising `MAX_COLLIDING_PATHS` 6 → 9 to turn the red collision gate green
was refused by `scripts/ci/cap_ratchet.py` and backed out. The ratchet only
covers Python constants, though — a YAML budget edit has no equivalent.

**Fixed 2026-08-04** together with A3, which is this finding from the other
direction. Every previously unowned top-level `platform/*.yaml` now has a
CODEOWNERS rule, and `codeowners-contract.test.mjs` derives its requirement from
`git ls-files` instead of the five-entry hardcoded list, so the next budget file
added fails the contract until somebody owns it.

### 9. Two priced surfaces are outside the advertised-price scan

`advertised-price-coverage.test.mjs:79`'s `PURCHASE_PATH` is a six-word filename
list (`order`, `cart`, `pay`, `payment`, `purchase`, `upgrade`, `donate` all
unmatched). `retail-pilot-intel/apps/docs` carries **358 price literals** — the
largest priced surface in the repo — and is invisible.

Separately, the parity contract it certifies for `local-site-studio` only asks
whether an amount is *in the sold set*, not whether it is bound to its tier.
Swapping the `$99/mo` and `$199/mo` figures on the anonymously-reachable
`/docs/product-bundles` page quotes a buyer double or half what Stripe charges,
and all three controls stay green.

## Revenue path: what actually blocks the first dollar

Every venture's first dollar is blocked on a human action off-repo, unchanged
from previous audits. What this audit adds is that **the code would not survive
the first sale even once those actions are taken.**

Two ventures — `studio.marisstella.dev` and `retail.marisstella.dev` — return
HTTP 200 with valid TLS today, serving `nginxdemos/hello:plain-text`. The
service map that puts them there is `platform/terraform/terraform.tfvars`, which
is **gitignored and untracked**, so the authoritative production mapping is
invisible to every control in this repository. This falsifies the compensating
claim at `platform/image-tag-exceptions.yaml:50-56` that none of those services
is publicly reachable. (That file also holds a live `hcloud_token`, DB passwords
and an `ADMIN_KEY` in plaintext in the working tree — untracked, so not a git
history leak, but it is what terraform reads.)

### print-atelier — would take money and not ship correctly

Ordered by what they do to a paid order:

1. ~~**Quantity is charged but never fulfilled.**~~ **FIXED** (`f7bb4070`).
   `printful-orders.ts` and `gelato-orders.ts` hardcoded `quantity: 1` while
   checkout metadata carried only `lineItemCount` (distinct lines), so a cart of
   3 × $85 charged $261.95 and ordered **one** print. The checkout now writes
   `lineItemQuantities` and `lineItemUnitAmounts` — one comma-separated key each,
   not one key per line, because Stripe's 50-key metadata cap already limits a
   cart to ten lines and two per-line keys would have cut that to eight. Neither
   resolver has a default: an order carrying no quantity is refused and names the
   key it needs, as the other three fulfillment inputs already do. Item 5 below
   moved with it, because correcting the quantity alone would have multiplied the
   customs misdeclaration rather than left it.
2. **The Printful payload cannot be accepted by Printful** —
   `printful-orders.ts:94-131` emits camelCase (`externalId`, `variantId`,
   `retailPrice`) where the API takes snake_case, and carries **no `files` array
   at all**, so there is no artwork to print. The venture's own research note
   (`docs/research/2026-06-12-...:5`) says `variant_id`. `gelato-orders.ts` *is*
   correct for Gelato — one adapter was checked against its vendor, the other
   was not.

   **FIXED 2026-08-04.** `submitPrintfulOrder` sends the builder's return value
   straight through `JSON.stringify` with no serializer in between, so this was
   the wire itself. A `toPrintfulWirePayload()` boundary converter now emits
   `external_id`, `variant_id`, `retail_price`, `state_code`, `country_code`,
   `retail_costs`, `packing_slip` and a per-line `files: [{url}]` from the same
   resolver Gelato uses, leaving the internal type — which operator panels and
   stored submissions read — unchanged. A line with no resolvable print file
   blocks with a named reason rather than inventing a URL. Note the consequence:
   nothing in this repository writes `artworkUrl`, so **every Printful order now
   blocks**, exactly as Gelato already does. That is the intended state, and it
   means Printful fulfilment is gated on checkout writing an artwork URL.
   `retail_costs`, `packing_slip` and the `files` element shape are named by no
   repo document and are recorded in the commit as inference to confirm against
   the vendor; only `variant_id` is covered by the research note.
3. **Gelato is sent a web page as the print file** — `gelato-orders.ts:101`
   falls back to `https://printatelier.com/prints/<slug>`, an HTML product page,
   on a host this venture does not deploy to. Nothing ever writes the metadata
   key that would override it.
4. **A placeholder email is on every order** — `?? "buyer@printatelier.com"` in
   both builders; nothing ever lifts the buyer's email from the Stripe session.
   Same class as the `123 Market St` incident that `buyer-shipping.ts` was
   written to end; the address was fixed, the email was not brought along.
5. ~~**Multi-line orders declare the wrong customs value**~~ **FIXED**
   (`f7bb4070`, with item 1). The whole PaymentIntent amount, shipping included,
   was stamped as `retailPrice` on *every* item. Printful's `retail_price` is per
   item and is multiplied by quantity, so each line now carries its own unit
   price and the declaration adds up to the goods the buyer bought, with shipping
   excluded. Pinned by
   `tests/fulfillment-orders-what-was-paid-for.test.ts`, which asserts against the
   charge rather than a literal — a test saying `quantity === 3` passes just as
   well once the checkout stops charging for three.
6. **The 30% artist payout has no implementation.** The only Stripe SDK call in
   the venture is `checkout.sessions.create`. `transfers.create` appears nowhere.
   Money can come in; nothing can send it out.
7. Orders and idempotency are process-local arrays (`orders.ts:30`), so a pod
   restart between Stripe delivery attempts re-prints.

Blocking before any of that matters: `platform/k8s/apps/print-atelier/deployment.yaml`
declares **zero env vars** and no Secret, and there is no add-to-cart anywhere —
`storefront/page.tsx:14` is `const cartCount = 2`, a literal.

Fixed during this session by a concurrent agent, and worth recording because it
was live at HEAD: `POST /api/stripe/checkout` accepted client-supplied prices
with no server re-derivation, so an $85 print could be bought for $1
(`d63325be`).

### local-site-studio — the closest to revenue, and two defects would corrupt the first sale

The verify chain here is genuinely sound: 1271/1271 tests across 133 files, no
collection gap, failability proved by injection. The Stripe integration is real
and fails closed. What is wrong sits around it:

1. ~~**A mocked email is recorded as permanently delivered.**~~ **FIXED**
   (`82c65b5d`). `src/lib/email/delivery.ts` adds `emailWasDelivered` (success
   AND not mock); all three durable sent-marker sites in the webhook gate on it,
   so a mock send leaves the marker unwritten and the message recovers on
   redelivery once a real key is configured. `describeUndeliveredEmail` names
   the missing key in the operator log rather than printing "unknown". Proved by
   mutation: reverting the three conditions to `.success` fails 6 tests.
   `sent-marker-contract.test.ts` reads route.ts as source, because a fourth
   marker site added later would reintroduce the shape with every behavioural
   test green — which is how this survived a 1271-test suite. Original finding:
   `email/resend.ts:98`
   returns `{success: true, mock: true}` when `RESEND_API_KEY` is unset; the
   webhook checks only `.success` and writes a durable sent-marker, so recovery
   on Stripe redelivery returns `already_notified` forever. `mock` is checked in
   ten places in the dashboard and **nowhere in the webhook**. First customer
   pays $500, receives nothing, and the system believes it sent both emails.
2. ~~**Self-serve checkout never captures the buyer's business name.**~~
   **FIXED** (`d73bdc70` source, `3f93986c` tests). The checkout form now asks
   for it whenever there is no CRM lead and blocks submit without it; it is
   carried in Stripe session metadata (truncated to 200 chars — Stripe rejects
   a session create above 500) and threaded through the webhook into
   `recordLeadPayment` → `buildPaymentStubLeadFields` and Convex `markLeadPaid`.
   Where the name is genuinely unknown the stub no longer invents one: a minted
   `organic-*` slug is never title-cased, and tagline / phone / city / hours are
   empty rather than fabricated. `mapSqliteRowToLead` was the other half — its
   prospecting fallbacks would have refilled on read what the write path left
   empty, so they are now skipped for a `payment_stub` row and kept for every
   other `dataSource`. Two existing tests asserted the fabricated values as
   correct and now assert the opposite. Original finding: the form
   collects only an email; `markLeadPaid` fabricates `businessName: "Organic
   8f3a2b1c9d4e"`, `phone: "(555) 000-0000"`, and a bakery tagline. That is what
   the receipt and the customer's own preview page then say.
3. **Go-live instructions point at a domain the project does not own** —
   `deploy/handoff.ts:32` falls back to `localsitestudio.com`, which is a
   registered third party with Zoho MX records.
4. `localhost:3000` and `"Your Brand"` / `[Registered business address — Colorado,
   USA]` are the shipped values while the Deployment sets no env — including in
   the CAN-SPAM footer of outreach email.
5. The advertised-price guarantee never calls `prices.retrieve`, so a stray
   test-mode Price ID charges $250 for a $500 bundle with every pricing test
   green.

Also: the image workflow publishes `:${sha}` only and the manifest pins
`:latest`, so **the deployed tag has no producer**.

### ai-first-markets — cannot have a customer without a code change — FIXED

`src/lib/auth.ts:1` — `ALLOWED_EMAIL` is a hardcoded module constant. Nothing
reads `process.env.ALLOWED_EMAIL`, yet `wrangler.jsonc:13` sets it and
`.env.example:20` documents it. A claim bound to a different field than the one
that acts, gating OAuth callback, sessions, and the Cloudflare Access path.
`auth.test.ts:14` asserts `isEmailAllowed(ALLOWED_EMAIL)` — tautological.
`/` is not in `PUBLIC_PATHS`, so the whole site redirects anonymous visitors to a
login exactly one address on earth can pass. `main` is also RED at this
venture's own gate (`ciContract.test.ts:45` demands a push trigger the deploy
workflow deliberately removed).

**Fixed 2026-08-04.** `getAllowedEmails()` reads the environment per call,
accepts a list, and denies everyone when it is unset or empty. `/` is in
`PUBLIC_PATHS`, and the login and unauthorized pages no longer print the
allowlist to anonymous visitors. The server/client boundary is proven, not
inspected: a test walks the real import graph from every `"use client"` module
and fails if `auth.ts` is reachable, and a canary build confirms the value
reaches 0 files under `.next`. On the ciContract disagreement the workflow was
right and the contract was stale — the assertion now pins the deliberate
dispatch-only shape rather than being deleted. Ten mutations were each run alone
to prove the new tests fail without their fix.

Still true, and off-repo: `wrangler.jsonc`'s `vars` block is the deploy's source
of truth, so changing the production allowlist is still a repo edit — no longer
a *code* edit, but a Worker secret or a CI-sourced value would be better.

### retail-pilot-intel — the flagship metric cannot report anything but 100% — FIXED

`packages/analytics/src/report.ts:37-40` computes door-to-POS conversion from a
pipeline (`scripts/bootstrap.ts:16`) that emits entries and sales 1:1 and never
emits a bounce, so the number is 100% every day with 0 bounces. The one test
asserts 0.0667 on hand-inserted rows, so it passes while the real pipeline
cannot produce anything but 1. Both ingest CLIs `process.exit(0)` after printing
to stderr, so a cron reads them as success forever.

**Fixed 2026-08-04, by declining to score rather than by inventing data.** The
schema can express a bounce but nothing in the repository can produce one —
`packages/edge/src/cli.ts` says so itself, the roadmap lists door line-crossing
as unbuilt Phase 1 work, and `data/` holds only a `.gitkeep`. So events now carry
a `synthetic` provenance flag and `dailySummary` returns `measurable: false` with
a stated reason when the day's events are stubs, when entries are zero, or when
sales exceed entries. A genuinely observed day still reports a number, and the
original hand-inserted 0.0667 case still asserts 0.0667. Rows written before this
commit are backfilled as synthetic, because every one of them came from the
stubs. Both ingest CLIs now exit non-zero, held by tests that assert the exit
code and spawn the real CLIs rather than mocking them.

The `apps/docs` price-literal count in finding 9 is confirmed at exactly 358, and
it is lower risk than the number suggests: there is no payment path of any kind,
the site is passcode-gated, `links.production` is null, every page carries a
prototype disclosure, and the bulk are illustrative ROI models, competitor
pricing and hardware COGS rather than offers. Worth recording separately: the
venture's `VENTURE.yaml` tests a €99/mo hypothesis while its docs advertise
€149–€249, €199 and €150–€350 in different places, and nothing checks a
hypothesis price against the priced surface.

## Suggested order of work

Struck items are done; the rest stand.

1. ~~Finding 1 (vacuous globs)~~ — done, `a658ed57`.
2. Finding 2 (`.github/workflows` unpoliced) — closes a live mutable-ref supply
   chain hole and reconnects print-atelier's tests to print-atelier's gate.
3. Findings 5 and 8 — production promotion and unreviewable budgets.
4. print-atelier ~~1~~, 2–4, ~~5~~ and local-site-studio 1–2 — the defects that
   corrupt a sale rather than block it. Worth fixing *before* the off-repo
   actions unblock revenue, not after. **print-atelier 2 is now the sharpest
   one left**: the Printful payload is camelCase where the API takes snake_case
   and carries no `files` array, so the order it submits cannot be accepted at
   all. The quantity and customs fixes are correct and still ride on a payload
   Printful rejects.
5. Findings 3, 4, 6, 7, 9 — real blind spots, none currently exploited.

### A note on method, from the session that fixed 1 and print-atelier 1/5

Two agents worked this backlog in the same working tree at once, and it cost
more than it bought. One swept the other's uncommitted files into a commit
titled after unrelated work, and added `if (missing) return 1` defaults to the
new resolvers on the way — restoring the exact defect being fixed, in a commit
whose subject said nothing about it. It was caught only because the regression
test had been written first.

That is [[weakenings-ride-in-unrelated-commits]] observed from the inside, and
the mechanism is mundane: the weakening was the cheapest way to keep existing
fixtures green. The two glob controls now sitting side by side came from the
same overlap. Before starting an item here, check `git log` and `git status` for
someone already in it, stage explicit paths, and re-read your own files before
trusting them.

## Addendum: the pytest control cluster

A seventh audit covered the 15 pytest suites under `tests/`. Same shape, and it
found the sharpest instances of it. These are open.

### A1. Two git-based controls are blind everywhere except this laptop

`scripts/ci/branch_collisions.py:103` and `scripts/ci/release_lag.py:207,221`
enumerate `git log --branches`, i.e. local `refs/heads/` only. A clone and a CI
checkout have exactly one local branch. Verified: the primary checkout reports
`FAIL: 9 colliding paths`; a clone of that same repo reports `PASS: 0
collisions, exit 0`. So the collision gate cannot fail in CI at all, and the
live 3-way duplicate of `quick-pick-survey/src/lib/routeAuthPosture.test.ts` is
invisible to it.

`scripts/ci/integration_debt.py:226` reads `refs/remotes/` too and its docstring
says exactly why. That fix was never carried across. Copy it.

This also explains a fact worth writing down: **`release_lag` being green in a
clone is a measurement artifact, not a state.** In a scratch clone `origin/main`
means the working repo, so the gate passes by construction.

### A2. The cap ratchet's own evidence window is the one cap nothing watches

`tests/test_cap_ratchet.py:391` skips `cap_ratchet.py` itself, so
`MAX_REVISIONS` (`scripts/ci/cap_ratchet.py:88`) — the history window every
floor in the tower is computed from — is unwatched, and lowering it is always
legal under the ratchet's own rule. Verified end to end on a clean clone:
lower `MAX_REVISIONS` 500 → 4 under the subject *"perf(ci): bound the
cap-ratchet history walk"*, raise `MAX_DECLARED_SLACK` 40 → 120, add three
unrelated commits to push the raise out of the window, and the result is
`PASS: 27 caps, none above its historical floor` with `34 passed`. Truncation
prints as a `NOTE`, which fails nothing.

The whole cap tower rests on this one number. It should be watched by something
that is not itself.

Three further holes in the same module, all verified: renaming a watched file
resets its floor (`revisions_for` at `:406` omits `--follow` — `git mv` plus a
150 → 400 raise passes 34/34); a cap declared as `MAX_X: int = 9999` or
`MAX_X = BASE * 4` or `CAP_X = 9999` is never registered, because the contract
test only matches a plain `ast.Assign` of `ast.Constant` named `MAX_*`; and
safety *floors* like `MIN_REVIEWED_REASON_WORDS` are outside the ratchet
entirely, since `evaluate` only fires on `current > floor`.

### A3. YAML budgets have no contract at all — FIXED

`cap_ratchet.py:289-303` watches 3 of the 11 numeric budget keys across
`platform/*.yaml`, and the contract test that demands every constant be watched
covers `python-constant` watches only. Verified in a clone: raising
`max_unshipped_age_days` 7 → 30 (a 4× weakening of the lead-time dimension,
which has no stale-direction check), `max_without_build_path` 5 → 6, and
`slack` 0 → 4 together yield `PASS: 27 caps` and `107 passed`.

This is finding 8 above from the other direction: those files have no CODEOWNERS
rule *and* no ratchet.

**Fixed 2026-08-04.** Seven keys are now watched (27 → 34 caps), each measured at
its historical floor before landing, so nothing was raised or lowered to make the
gate pass. The count above is off by one: there are **12** numeric budget leaves,
not 11 — `VENTURE.template.yaml`'s `budget.monthly_cap` is the twelfth, and it is
exempt because the caps that bind live in each `ventures/<name>/VENTURE.yaml`,
outside this enumeration. Exemptions are now a per-key registry carrying a
written reason rather than prose above the tuple, and a blanket or wildcard
exemption is refused by test. The enumeration contract itself is the fix that
matters: it fails when any budget key is neither watched nor exempt, which is
what let eight keys drift while the `python-constant` half of the same contract
was enforced. Enumeration reads the union of the on-disk glob and `git ls-files`,
because `audit_exceptions.py` was blind to six advisories for reading
`git ls-files` alone.

A2 is still open: `MAX_REVISIONS` remains unwatched, because the constants
contract still skips its own file.

### A4. A kill criterion counts as a brake if it parses

`portfolio/router/kill_criteria.py:466` — `has_stopping_rule()` is
`any(r.outcome != NOT_MEASURABLE)`, which asks whether a threshold *parses*,
never whether it can be *reached*. Verified: raise
`cumulative_agent_spend_usd` from 150 to 1000000000 in all 12 `VENTURE.yaml`
files and both gates still exit 0, with the report printing *"Every venture
holds at least one criterion that can be measured."*

Compounding, the 12 evaluable brakes all read one hand-written file
(`portfolio/ledger/*.yaml`) that nothing gates downward — setting every
`agent_spend_usd` to `0.00` passes 84 tests. `validate_ledger.py` already
detects that seven July entries share `18.18` = `500 × 0.40 / 11`, i.e. the
orphaned `allocate.py`'s $500 split seeded the ledger, but `scripts/test-ci.sh:128`
runs it **without `--strict`**, so it exits 0.

### A5. The image controls read one of two deployment surfaces

`scripts/ci/image_tags.py:43` hardcodes `SCAN_ROOT = "platform/k8s"`.
`platform/terraform/` renders the same Helm chart, is applied by
`terraform-apply.yml` on push to main, and is never read. Live today:
`agent_platform.tf:65` pins `codercom/code-server` at `latest` on a public
Traefik ingress (`code.marisstella.dev`), and `variables.tf:29` makes
`tag = optional(string, "latest")` the **default for every service**.

Also: `MUTABLE_TAGS` is a 10-word denylist, so `:release`, `:current`,
`:staging`, `:live` and `:rolling` all read as "pinned"; and
`image_release_path.py:233` opens only `<app>/deployment.yaml` and accepts only
`kind: Deployment`, so Jobs and CronJobs naming unbuilt images are outside the
"no producer" count — two already are.

### A6. Two more weakenings that rode in on unrelated commits

Confirming the pattern already recorded against this class:

- `2fdcf837` *"feat: complete stash convergence and clean uncommitted work"*
  added **EXC-014**, a new lint waiver on
  `quick-pick-survey/src/components/UnifiedRunner.tsx` — the only venture
  serving production traffic — buried inside the 6200-file worktree-snapshot
  commit.
- `b388f692` *"fix(print-atelier): clear the 31 lint errors"* — the subject says
  *clear*; the diff **adds EXC-015 (count 3) and EXC-016 (count 1)**. Four of
  the 31 were waived rather than fixed, and the audit cannot tell the two apart.

Read the diff, not the subject line.

### A7. Baseline prose contradicts its own machine number

Three registers assert in prose something their own measurement denies:
`platform/kill-criteria-baseline.yaml:33` declares
`max_without_stopping_rule: 0` with "All 12 ventures carry active, evaluable
stopping rules" while its `rationale` in the same file still says "10 of 11
ventures still have no rule capable of ending their funding" — `load_baseline()`
requires `rationale` to be non-empty and never reads it;
`platform/image-tag-exceptions.yaml:41` asserts "no workflow that publishes any
of them" while `print-atelier-image.yml` and `local-site-studio-image.yml` both
build and push today; and `image-release-baseline.yaml:44` declares 5 where the
module measures 4.

A required-but-unread field is a place where prose and behaviour drift silently.

### Genuinely sound, worth not re-auditing

`scripts/ci/integration_debt.py` and its tests are the strongest control in the
repository — it reads both ref namespaces, cannot pass vacuously, enforces both
drop-register directions, ratchets all three caps, and is a named gate.
`duplicate_definitions.py` is sound within Python/JS/TS (its gap is the
extension list, not the assertion). `stopping_rule_review.py`,
`audit_exceptions.py`'s expiry and fail-closed behaviour, the coverage
ratchet's *measurement* machinery, and `tests/test_portfolio_router.py` pinning
`router.py` as authoritative were all checked hard and hold.

## Addendum: the release-lag baseline was being forged

Found 2026-08-04, after the audit above, and it outranks everything in it.

`scripts/ci/release_lag.py` measures undelivered work against a baseline it
resolves from the local remote-tracking ref `refs/remotes/origin/main`. That ref
is writable locally, and in this repository it has repeatedly been written by
hand. On the afternoon of 2026-08-04 the gate reported:

    Baseline:          origin/main @ c5a2d2650d90 (0 days old)
    Unshipped commits: 2 (budget 125, slack 40)

and passed. A plain `git fetch origin` moved `origin/main` **backwards 336
commits** to `a4b8f23f`, and `git ls-remote origin main` confirms `a4b8f23f` —
dated **2026-07-31** — is the true remote tip. The same gate then reported:

    [lag-above-budget] 356 commits are not in origin/main, over the declared
    budget of 125. The undelivered pile grew; nothing in it is live.

The mechanism is visible in `git reflog show refs/remotes/origin/main`. Four
entries have a **blank reason** — `c5a2d265`, `dd41e0a4`, `7218a388`,
`233c558b` — and a blank reason means a direct `git update-ref`, because a fetch
records `fetch origin: ...` and a push records `update by push`. Every one of
them is followed by a real fetch recording `forced-update` back to `a4b8f23f`.

So the control that exists to answer "did this work reach production?" was
answering "yes" because its definition of production had been set to a local
commit. This is not the clone artefact recorded elsewhere — `release_lag` being
green in a scratch clone is a measurement artefact, and this is the primary
checkout. The input was not merely narrow. It was forged.

Two consequences worth stating plainly:

- **Nothing fixed in this document is live.** Not the checkout price hole, not
  the fulfilment fixes, not the mock-email marker. `marisstella.dev` serves the
  code as of 2026-07-31.
- `studio.marisstella.dev` and `retail.marisstella.dev` still answer HTTP 200
  with `nginxdemos/hello` — verified again on 2026-08-04, and the response leaks
  the pod name and cluster IP (`local-site-studio-web-service-...`,
  `10.42.0.124`). `platform/k8s/apps/local-site-studio/deployment.yaml:19` pins
  `:latest` while `.gitea/workflows/local-site-studio-image.yml` publishes only
  `:${github.sha}`, so **the tag the cluster pulls has no producer** — which is
  why the demo image is still there.

The fix in progress is to make `release_lag.py` verify its baseline against
`git ls-remote` rather than trust the local tracking ref, and to give the
offline case a distinct non-passing outcome rather than a silent fall-through.
Whatever else changes, **run `git ls-remote origin main` and compare before
quoting any release-lag number.**
