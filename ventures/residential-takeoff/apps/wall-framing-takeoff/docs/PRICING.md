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

Paddle is the merchant of record (owner, 2026-11-24). The page uses the portfolio's shared
Paddle path, `platform/billing/` (its README has the whole flow); nothing here holds a secret.

- `checkout.mjs` is **generated** by `node platform/billing/sync.mjs` from the
  `residential-takeoff` row of `platform/billing/catalogue.mjs`: product, Paddle price id,
  client-side token, Ed25519 public key, billing Worker origin, environment. All public; all
  empty as committed. `paddle.mjs` is a byte-for-byte copy of `platform/billing/client.mjs`
  (the sync writes it; `licence.test.mjs` fails if the copy drifts).
- `billing.mjs`: the billing port, the grants `BillingProvider` cut down to what a static page
  can do (`wireBuy(el)`, `validate(key)`). `createBillingProvider` returns `null` until every
  public value is set (`paddle.mjs` `onSale`): **dark**. `fakeBillingProvider` backs the tests.
- A sale: the Buy button opens Paddle's overlay with a random claim code; Paddle's
  `transaction.completed` webhook reaches the shared billing Worker, which signs a licence key
  (`ms1.<payload>.<signature>`) for the product the *price* sells; the page collects it by claim
  code and checks it **offline** against the public key. The plan comes from the key: a one-off
  key is a Job report, a subscription key the contractor suite (`billing.mjs` `planOf`).
- `plans.mjs`: `entitlement({ dark, valid, plan })` and `allowed(feature, ent)` are the one plan
  check every paid feature goes through. **While dark, every feature is open**, so nobody
  meets a lock they cannot buy past.
- Once lit, a key unlocks only if its signature checks against the public key **and** it names
  this product; a key for another tool, a forged or truncated key, or a malformed one unlocks
  nothing (`billing.test.mjs`, `licence.test.mjs` through `platform/billing/testkit.mjs`).
- Where the check runs: the page's "Download supplier material list (CSV)" button and its
  bid-package card; the CLI's `--material-list`, which takes `--licence=KEY`. Exit code 3
  means "needs a key".
- The code is MIT-licensed in its public copy and source-available here; the key is an
  honest-buyer convenience, not copy protection, and the page says so.

## To light it (owner only)

1. Do `platform/billing/README.md`, "Going live", once for every pack (the billing Worker,
   the client-side token, the key pair, the webhook).
2. Create the "Job report" product in Paddle, a one-off $29 price, and put its `pri_...` id in
   the `residential-takeoff` row of `platform/billing/catalogue.mjs`.
3. Run `node platform/billing/sync.mjs`, then `node --test '*.test.mjs'` here (the
   `sample-pack.test.mjs` "not on sale" check tells you to update the marketing copy) and
   `node eval-material-list-click.mjs`.

The suite's `pro` plan is not sold from this page.

## Known limits

- **One key, one house is on trust.** The key does not tie itself to a plan file, so a Job
  report key keeps working on the next house. Binding it (the plan's hash in the key's
  claims, sent with the checkout) is not built; decide after the first ten sales whether it
  matters.
- **Refunds and tax** are the merchant's. The bid-package card already states a 30-day
  refund on request.
- **No usage data yet.** `usage.mjs` counts `material_list_downloaded` in the visitor's own
  browser only; nothing is sent anywhere.
