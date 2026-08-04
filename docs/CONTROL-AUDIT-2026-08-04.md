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

### 1. A vacuous test glob disarms the only gate on the venture in production

`scripts/test-ci.sh:71` and `platform/ci/test/gate-substance.test.mjs:47`.
`node --test <glob>` exits **0** on zero matched files (verified on Node 22).
`portfolio/marisstella-homepage/package.json`'s `"test": "node --test 'test/*.test.mjs'"`
is the only gate on the one venture with a public customer surface. Rename its
five test files and all 26 meta-gate tests stay green over zero assertions. Same
shape in `ai-first-markets`, `print-atelier`, `retail-pilot-intel`.

Fix: assert that every declared gate's glob resolves to at least one tracked
file, and fail closed when it does not.

### 2. `ventures/*/.github/workflows/` is unpoliced by every workflow control

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

### 8. Budget and baseline files can be edited without review

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

1. **Quantity is charged but never fulfilled.** `printful-orders.ts:115` and
   `gelato-orders.ts:122` hardcode `quantity: 1`; checkout metadata carries only
   `lineItemCount` (distinct lines). Cart of 3 × $85 charges $261.95 and orders
   **one** print.
2. **The Printful payload cannot be accepted by Printful** —
   `printful-orders.ts:94-131` emits camelCase (`externalId`, `variantId`,
   `retailPrice`) where the API takes snake_case, and carries **no `files` array
   at all**, so there is no artwork to print. The venture's own research note
   (`docs/research/2026-06-12-...:5`) says `variant_id`. `gelato-orders.ts` *is*
   correct for Gelato — one adapter was checked against its vendor, the other
   was not.
3. **Gelato is sent a web page as the print file** — `gelato-orders.ts:101`
   falls back to `https://printatelier.com/prints/<slug>`, an HTML product page,
   on a host this venture does not deploy to. Nothing ever writes the metadata
   key that would override it.
4. **A placeholder email is on every order** — `?? "buyer@printatelier.com"` in
   both builders; nothing ever lifts the buyer's email from the Stripe session.
   Same class as the `123 Market St` incident that `buyer-shipping.ts` was
   written to end; the address was fixed, the email was not brought along.
5. **Multi-line orders declare the wrong customs value** — the whole
   PaymentIntent amount, shipping included, is stamped as `retailPrice` on
   *every* item.
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

1. **A mocked email is recorded as permanently delivered.** `email/resend.ts:98`
   returns `{success: true, mock: true}` when `RESEND_API_KEY` is unset; the
   webhook checks only `.success` and writes a durable sent-marker, so recovery
   on Stripe redelivery returns `already_notified` forever. `mock` is checked in
   ten places in the dashboard and **nowhere in the webhook**. First customer
   pays $500, receives nothing, and the system believes it sent both emails.
2. **Self-serve checkout never captures the buyer's business name.** The form
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

### ai-first-markets — cannot have a customer without a code change

`src/lib/auth.ts:1` — `ALLOWED_EMAIL` is a hardcoded module constant. Nothing
reads `process.env.ALLOWED_EMAIL`, yet `wrangler.jsonc:13` sets it and
`.env.example:20` documents it. A claim bound to a different field than the one
that acts, gating OAuth callback, sessions, and the Cloudflare Access path.
`auth.test.ts:14` asserts `isEmailAllowed(ALLOWED_EMAIL)` — tautological.
`/` is not in `PUBLIC_PATHS`, so the whole site redirects anonymous visitors to a
login exactly one address on earth can pass. `main` is also RED at this
venture's own gate (`ciContract.test.ts:45` demands a push trigger the deploy
workflow deliberately removed).

### retail-pilot-intel — the flagship metric cannot report anything but 100%

`packages/analytics/src/report.ts:37-40` computes door-to-POS conversion from a
pipeline (`scripts/bootstrap.ts:16`) that emits entries and sales 1:1 and never
emits a bounce, so the number is 100% every day with 0 bounces. The one test
asserts 0.0667 on hand-inserted rows, so it passes while the real pipeline
cannot produce anything but 1. Both ingest CLIs `process.exit(0)` after printing
to stderr, so a cron reads them as success forever.

## Suggested order of work

1. Finding 1 (vacuous globs) — cheapest, and it is the one that can silently
   disarm everything else.
2. Finding 2 (`.github/workflows` unpoliced) — closes a live mutable-ref supply
   chain hole and reconnects print-atelier's tests to print-atelier's gate.
3. Findings 5 and 8 — production promotion and unreviewable budgets.
4. print-atelier 1–4 and local-site-studio 1–2 — the defects that corrupt a
   sale rather than block it. These are worth fixing *before* the off-repo
   actions unblock revenue, not after.
5. Findings 3, 4, 6, 7, 9 — real blind spots, none currently exploited.
