# Seller Books billing

Paid plans ship **dark**. Until the owner sets the Paddle secrets below, `createBillingProvider`
returns `null`: checkout answers 503, the Billing page says paid plans are not on sale yet, and every
organization is on the Free plan. Nothing in this repository holds a key.

Built on [`packages/billing`](../../../packages/billing/README.md), imported as source through the
`@billing` path alias (`aliases.ts`, `tsconfig.json`), so `package.json` and the lockfile are
unchanged. Checkout, portal and webhook handling are ported from `apps/cmmc` (the same rules as
`apps/payapps` and `apps/jobshop-quote`). Added 2026-11-26.

## Plans (`src/shared/plans.ts`)

| Plan | Monthly | Annual | Platforms | Users | Orders a month | Sold |
| --- | --- | --- | --- | --- | --- | --- |
| Free (`free`) | $0 | – | 1 | 1 | up to 25 (**hard**) | no (default) |
| Side hustle (`side`) | $15 | $150 | 2 | 1 | about 100 (soft) | yes |
| Full time (`fulltime`) | $35 | $350 | all 6 | 1 | about 600 (soft) | yes |
| Business (`business`) | $69 | $690 | all 6 | 4 (owner + 3) | about 2,500 (soft) | yes |
| Complimentary (`comp`) | $0 | – | all 6 | unlimited | unlimited | no (operator grant) |

The paid prices, platform counts and order allowances are the marketing site's proposal
(`apps/seller-books-site/docs/PRICING.md`, `src/content.mjs` `TIERS`); `plans.test.ts` pins them so a
change to one side shows up. They are untested hypotheses. The **Free plan is this app's addition**:
the site does not list it yet (its FAQ says "from $15 a month", which stays true for paid plans). Add
it to the site when early access opens, or drop it here if the owner prefers a trial.

`src/shared/plans.test.ts` fails CI when a paid plan falls under the 40% margin floor. The app makes no
model calls, so the cost model is: twice the plan's order allowance (a soft cap is a guide, so a busy
month must not sink the margin) at $0.00001 an order on top of grants' Cloudflare base fee and per-org
budget, the owner's support time ($5 / $10 / $20 an org-month), Paddle's 5% + $0.50 and a 3% refund
reserve. Paddle's fixed $0.50 is the largest cost on Side hustle, which is why annual plans exist.
`billing/paddle-catalog.json` is generated from `PLAN_LIST` (the same test fails when it is stale;
regenerate with `UPDATE_PADDLE_CATALOG=1`, see the test's header).

## What the limits do

- **Platforms** (Free 1, Side hustle 2): an import from a platform the org has not imported from
  before answers 402 `payment_required` when the plan's platforms are used up. A platform counts once
  any import from it exists; deleting every import from a platform frees it.
- **Orders, Free plan only:** an import that would take any calendar month (by sale date, orders only,
  refunds not counted) over 25 orders is refused whole with 402, naming the first month. Nothing is
  half-imported.
- **Orders, paid plans:** never blocking (the site's promise: "going over the order cap in a busy month
  never locks anything"). The Billing page shows this month's orders and the busiest month of the last
  12, and suggests the cheapest plan that fits when the seller has outgrown theirs (`planFor`).
- **Users:** inviting answers 402 when members plus pending, unexpired invitations reach the plan's
  users; accepting an old invitation answers 402 when the members already fill the plan (a plan that
  lapsed after the invitation was sent).
- **Nothing is ever hidden or deleted.** Sales, the P&L, inventory, mileage, expenses, the Schedule C
  worksheet and every CSV export keep working on every plan, so a lapsed seller can always get their
  own books out at tax time.

A subscription grants its plan while `active`, `trialing` or `comp`, and while `past_due` for 7 days
from the first failed renewal (the Billing page shows the deadline). After that, or when
`canceled`/`paused`, the Free limits apply.

## Routes

| Route | Who | What |
| --- | --- | --- |
| `GET /api/billing/plans` | anyone | Public plan list (for a pricing page) |
| `POST /api/billing/webhook` | Paddle | Signature-verified; always 200 once verified |
| `GET /api/orgs/:orgId/billing` | members | Plan, status, usage, limits, suggested plan, plans |
| `POST /api/orgs/:orgId/billing/checkout` | admins | `{plan, interval, renewalConsent: true, promoCode?}` → hosted checkout URL (400 without the consent) |
| `POST /api/orgs/:orgId/billing/portal` | admins | `{action?: "manage" \| "cancel"}` → Paddle customer portal URL, or the subscription's cancellation form |

The webhook is mounted before the Origin check and the session (`src/worker/app.ts`). It follows
`packages/billing` exactly: the org is bound only by an existing subscription id or a signed,
unexpired, single-use checkout token (never `custom_data.orgId`); the plan comes only from the billed
price; `comp` is never granted by a webhook; another customer cannot take over an org's subscription;
events are idempotent on `(provider, event id)` and an event that threw is retried on redelivery.
`test/worker/billing.test.ts` covers the limits, checkout and the webhook's binding rules. Checkout and
the portal return to `/o/:orgId/billing`. `GET /api/health` reports `billing: true|false`.

## Turning it on (owner steps)

1. Terms, privacy, refund and acceptable-use pages: **built 2026-11-26** (`docs/legal/*.md`, served at
   `/legal/:key` and `/api/legal`, accepted per user and version and required by the API before the books, since 2026-11-26; see ARCHITECTURE.md, "Legal
   documents"). Paddle's domain review asks for them. Operator, contact email and launch
   authority: `docs/legal/OPERATOR.md` at the repository root (2026-11-26; agents approve launch).
2. The deploy workflow `seller-books-deploy` (**built 2026-11-26**, [DEPLOY.md](DEPLOY.md)) syncs
   `billing/paddle-catalog.json` to Paddle with `packages/billing/scripts/paddle-catalog.ts` when the
   repository secret `SELLER_BOOKS_BILLING_API_KEY` is set, and passes the price ids it reads back to the
   Worker as `BILLING_PRICE_IDS`, as `apps/cmmc`, `apps/payapps` and `apps/jobshop-quote` do.
3. Owner only, in the repository settings (the deploy copies them to the Worker):
   the variable `SELLER_BOOKS_BILLING_PROVIDER=paddle`, the secrets `SELLER_BOOKS_BILLING_API_KEY` and
   `SELLER_BOOKS_BILLING_WEBHOOK_SECRET`; `AUTH_SECRET` (it also signs checkout tokens) must be 32+ characters.
4. A Paddle notification destination at `https://<seller-books host>/api/billing/webhook` for
   `subscription.*` and `transaction.completed`.

## Automatic renewal (2026-11-27)

Resellers are often consumers (a side hustle bought for themselves), so the state automatic-renewal
laws apply to Seller Books more than to the B2B apps. This was the launch review's open check
("Renewal terms", [LAUNCH-REVIEW.md](LAUNCH-REVIEW.md)). Read 2026-11-27, by an agent, not a lawyer:

| Law | What it asks | Where the app does it |
| --- | --- | --- |
| Colorado, C.R.S. 6-1-732(2)(a)-(b) ([text](https://colorado.public.law/statutes/crs_6-1-732), current through fall 2025) | the renewal terms clearly and conspicuously before the contract, next to the purchase button | `renewalTerms()` under every "Choose" button on the Billing page, which now reads "Choose Side hustle, renews monthly" |
| Colorado, 6-1-732(2)(c) | a written acknowledgment the consumer can keep, with the terms and how to cancel | Paddle's receipt (merchant of record) plus the Terms' "Automatic renewal" bullet; a receipt email of our own is not built |
| Colorado, 6-1-732(2)(d), as SB25-145 rewrote it ([introduced text](https://content.leg.colorado.gov/sites/default/files/documents/2025A/bills/2025a_145_01.pdf); reported as enacted, applying from 2026) | a one-step online cancel link, available right after sign-in, for anyone who signed up online | "Cancel subscription" on the Billing page: `POST /billing/portal {action: "cancel"}` asks Paddle for the subscription's `cancel_subscription` deep link (portal session with `subscription_ids`), which opens Paddle's cancellation form directly |
| Colorado, 6-1-732(4) | a notice that it renews unless cancelled, and how to cancel, 25 to 40 days before each renewal; for terms under 12 months, before each renewal that carries it past a 12-month period | `services/billing/renewal-notices.ts` on the daily cron: 26 to 39 calendar days ahead (inside the window whatever the renewal's hour), every yearly renewal and each monthly plan's twelve-month mark; a renewal first seen inside 25 days gets a late notice (logged) rather than none |
| California, Bus. & Prof. Code 17602 as amended by AB 2863, from 2025-07-01 ([summary](https://btlaw.com/en/insights/alerts/2025/california-expands-automatic-renewal-law-new-requirements-now-in-effect)) | express affirmative consent to the renewal terms, proof of it kept (3 years, or 1 year after the contract ends, whichever is longer), a yearly reminder with frequency, amount and how to cancel, cancel by the channel used to sign up | the consent tick (checkout answers 400 without `renewalConsent: true`); `pending_checkouts.renewal_terms_version` and `renewal_consent_at` (the server's `RENEWAL_TERMS_VERSION`, never the page's); the same notice; the same one-step cancel |

The notice goes to every owner and admin (the people who can cancel), carries the price exactly as
Paddle's webhook reported it (or "the price on your last receipt from Paddle" when it was discounted
or not reported: never a guess), and has no unsubscribe link: it is the notice the law asks for. One
row per (shop, renewal date) in `renewal_notice` is the claim, so a doubled or retried run sends once;
a send that reaches nobody releases the row and the next day retries. Tests:
`test/unit/renewal-notice.test.ts` (the window, the monthly mark, month-end dates),
`test/worker/renewal-notices.test.ts` (recipients, price, idempotency, retry, plans that do not renew),
`test/worker/billing.test.ts` (consent required and recorded, the cancel link) and e2e spec 02 (the
terms beside the button, the button disabled until the tick).

**Keeping the proof (2026-11-27, renewal-consent-retention).** The consent on a pending checkout is
deleted with its shop (`ON DELETE CASCADE`), which fell short of California's retention period (three
years, or one year after the contract ends, whichever is longer) for a subscriber who cancels and then
deletes the shop. So when a checkout becomes a subscription, its consent is copied to `renewal_consent`
(`services/billing/renewal-consents.ts`, migration `0012`, which also backfills consumed checkouts): no
foreign keys, no name or email, the Paddle subscription and customer ids as the link to the merchant
of record's own records. A `canceled` webhook, or deleting the shop (at the paid period's end when the
plan runs to it, since the later `canceled` event finds no shop), sets `ended_at` and `keep_until`;
the daily cron deletes rows past `keep_until`. The Privacy Policy's "Retention" says so. Tests:
`test/worker/renewal-consents.test.ts`.

Still open, for the owner or a lawyer when volume grows: a price change needs
its own notice under both laws (none is planned, and the Terms already promise one in advance); and
other states (New York, Illinois, Virginia and more) have similar laws not read here.

## Operators

Grant a pilot or partner unlimited use with a `comp` row:

```sql
INSERT INTO subscriptions (org_id, plan_key, status, cancel_at_period_end, created_at, updated_at)
VALUES ('org_…', 'comp', 'comp', 0, unixepoch() * 1000, unixepoch() * 1000);
```

## Local demo

`FAKE_EXTERNALS=true` in `.dev.vars` selects the signed fake provider: checkout returns to
`/o/:orgId/billing?checkout=success&fake_checkout=…` without charging (no webhook is sent, so the plan
does not change). The fake is refused when `APP_ENV=production`.
