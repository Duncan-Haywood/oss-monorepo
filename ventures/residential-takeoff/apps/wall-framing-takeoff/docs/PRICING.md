# Pricing and the paid path

Decided 2026-11-24 for move step 3 ("paid path") of oss-monorepo
`portfolio/monetization/LICENSING_TRANSITION.md`. The price bands are the ones bet #6
in oss-monorepo `portfolio/monetization/bets.md` (branch `claude/relaxed-planck-7fn5tx`)
gives for residential takeoff, as quoted in the task brief for this run: **$13–38 per
report** (what roof and takeoff reports sell for one job at a time) and **$149–299 a
month** (what contractor software sells for). This session could not open oss-monorepo,
so the two documents were not re-read here; check the bands against them before a
checkout link is set.

## The decision

**Subscription for the contractor-suite future; one-off per job until then.**

| Plan | Kind | Price | Unlocks | On sale |
| --- | --- | --- | --- | --- |
| Free | | $0 | Everything that shipped free before 2026-11-24: layout, order, cut list, drawings, PDF, every calculator page, CSV | always |
| Job report (`report`) | one-off | **$29** per house | supplier material-list export + branded bid package | when the owner fills the `residential-takeoff` row of `platform/billing/catalogue.mjs` |
| Contractor suite (`pro`) | subscription | **$149 / month** | the same, for every job, inside the suite (pay apps, estimating) | from `apps/payapps`, not from this page, once the estimating module ships |

Plan keys, prices and features live in `plans.mjs`; `billing.test.mjs` fails the build if
either price leaves its band.

### Why one-off now

- **Who buys today.** The page's first visitors are owner-builders and small framing
  crews (VENTURE.yaml). They frame one to a handful of houses a year. At $149 a month a
  subscription only beats $29 a job at five or more houses a month, which is a
  production builder, and production builders are who the suite is for.
- **How the norm is bought.** Per-report is how roof reports and takeoff services are
  sold: one job, one payment, no account. A one-off matches what the buyer already does.
- **What the code can do without a server.** The site is static. A one-off licence key
  from a merchant of record (hosted checkout, tax, refunds, a public validate call) works
  with no backend and no secret in this repository. A subscription needs webhooks and a
  billing store; that is the suite's job (below).
- **Where in the band.** $29 sits in the upper half of $13–38 because one report covers
  walls, wall sheathing and the roof, and is re-run free as the plan changes. It stays
  under $38 because the quantities come from a plan the buyer typed or drew, not from a
  measured site, and nothing is checked against code.

### Why a subscription in the suite

The contractor suite (bet #1, `apps/payapps`) bills monthly for pay applications. Estimating
is used on every bid, not once per house, so inside the suite the takeoff is part of the
subscription, not a per-report add-on. $149 is the bottom of the $149–299 band on purpose:
the suite has to earn the upper tiers with pay apps and lien waivers, not with takeoff
alone. The suite will bill through a `BillingProvider` in the shape of
`apps/grants/src/worker/ports/billing-provider.ts` (checkout, portal, signed webhooks,
Paddle as merchant of record).

## How the paid path is wired (dark)

Moved to Paddle on 2026-11-27 (ROADMAP, "Checkout on Paddle, part 1"). The first design called
Lemon Squeezy's public licence-validate endpoint; the portfolio's merchant of record is Paddle,
which has no public licence check, so the page now uses the shared path in `platform/billing/`
(its README has the whole flow and why the billing Worker lives on the owner's own account).

- `checkout.mjs` is **generated** by `node platform/billing/sync.mjs` from the catalogue's
  `residential-takeoff` product: client-side token, price id, Ed25519 public key, the billing
  Worker's origin, sandbox or production. All public; `checkout.test.mjs` fails on a hand edit.
- `paddle.mjs` is a byte-for-byte copy of `platform/billing/client.mjs` (the shared testkit
  fails on drift): Paddle.js overlay checkout with a random claim code, key pickup from the
  billing Worker, offline Ed25519 verification.
- `licence.mjs`: `wireBuyButton`, `checkLicence`, `onSaleNow` over the generated config.
- `billing.mjs`: the billing port (`wireBuy(el)`, `validate(key)`), the grants `BillingProvider`
  cut down to a static page. `createBillingProvider()` returns `null` while any public value is
  empty: **dark**. A valid key maps to the Job report plan (`PRODUCT_PLAN`); the billing Worker
  signs only for the product whose price was paid, and a key for another product (the free
  edition's bid-package key included) unlocks nothing. `fakeBillingProvider` backs the tests.
- `plans.mjs`: `entitlement({ dark, valid, plan })` and `allowed(feature, ent)` are the one plan
  check every paid feature goes through. **While dark, every feature is open**, so nobody
  meets a lock they cannot buy past.
- Where the check runs: the page's "Download supplier material list (CSV)" button and its
  bid-package card (an accepted key is kept in that browser's storage); the CLI's
  `--material-list`, which takes `--licence=KEY`. Exit code 3 means "needs a key".
- A one-off key never expires and cannot be revoked after a refund (`platform/billing/README.md`).
  It is not tied to one house: "$29 per house" is the price on trust, and the key is an
  honest-buyer convenience, not copy protection; the page says so.

## To light it (owner only)

1. Do `platform/billing/README.md`, "Going live", steps 0 to 3 once for every pack (billing
   Worker, key pair, client-side token, notification destination).
2. In Paddle, create the "Job report" product, one-off, $29. Put its `pri_...` id in the
   `residential-takeoff` row of `platform/billing/catalogue.mjs`, run
   `node platform/billing/sync.mjs`, and redeploy the billing Worker with that catalogue.
3. Run `node --test '*.test.mjs'` here and `node --test platform/billing/billing.test.mjs`.
4. Buy once in the sandbox; check the key fills in, the material list downloads, and the key
   survives a reload. Then update the paid page's "Checkout is not open yet" note and
   `sample-pack.test.mjs`.

The Contractor suite plan (`pro`) is not sold from this page: the suite sells it.
