# Billing: paid plans through Paddle (dark)

Status 2026-11-26: built and tested against the signed fake provider; **dark** until the owner sets
the variables below. No price is charged anywhere yet. Code: `pro/billing.mjs` (checkout, webhook,
entitlement), `pro/plans.mjs` (plans), `pro/store.mjs` and `pro/sql-store.mjs` (rows), on top of
`packages/billing`.

## Plans

The paid tiers are the ones the marketing site publishes (`apps/einvoice-site/content/pricing.mjs`,
its `docs/PRICING.md`); `pro/plans.test.mjs` fails if the app and the site drift apart.

| Plan key | Name | Price (EUR / month, excl. VAT) | Client companies | Invoices checked / month | Model explanations / month | API keys |
|---|---|---|---|---|---|---|
| `trial` | Trial (not sold) | 0 | 3 | 100 | 50 | 2 |
| `starter` | Firm S | €19 | 10 | 500 | 300 | 3 |
| `standard` | Firm M | €29 | 30 | 1,500 | 500 | 5 |
| `plus` | Firm L | €49 | 100 | 4,000 | 850 | 10 |

Monthly only: annual billing is open question 1 in the site's `docs/PRICING.md`. Every account
starts on its own plan (`trial` unless an operator creates it with another through
`POST /v1/admin/accounts`). An entitled subscription replaces that plan; when the subscription
ends, the account falls back to its own plan.

API keys are not on the site's table: they are the app's own limit (the site sells the metered
vendor API separately; not built yet).

## Prices and margin

`pro/plans.test.mjs` runs packages/billing's `assertPricingBand`: every paid plan keeps at least a
40% margin when the customer uses the whole allowance. Assumptions, worst case:

- One invoice checked: measured 1.1 ms of CPU for check + explain + fix + re-validate on the
  examples (2026-11-26, Node 22, without the official Schematron). Budgeted at $0.001, about 100x
  that, to cover Schematron runs, run-history storage and request overhead on any host.
- One model explanation: 3,000 tokens in and the full 1,500 out (`explain.mjs` caps output) on the
  configured default model, `claude-haiku-5-5`, with no cache discount.
- Hosting base $5 a month over 25 accounts plus $0.10 per account (packages/billing's default).
- Paddle 5% + $0.50 per charge; a 3% refund reserve.
- Prices are in euro and costs in dollars; the check compares them one to one, which undercounts
  revenue (a euro is worth more than a dollar), so the margins below are lower bounds.

| Plan | Full cost at full allowance | Margin |
|---|---|---|
| Firm S, €19 | about $3.13 | 83% |
| Firm M, €29 | about $5.14 | 82% |
| Firm L, €49 | about $9.61 | 80% |

Moving explanations to a larger model changes this: on `claude-sonnet-5-5` the same worst case
gives 52%, 48% and 46%, still above the 40% floor but below the 60% goal. Re-run the test after any
model change.

## How a purchase works

1. `POST /v1/billing/checkout {plan, email, promoCode?}` (any API key of the account). A pending
   checkout row is stored for the account (24 h) and a signed token, which names neither the account
   nor the plan, goes into the Paddle transaction's `custom_data`. The answer is the hosted checkout
   URL. An account with a live subscription gets 409: plan changes and cancellation go through
   `POST /v1/billing/portal` (Paddle's customer portal).
2. Paddle sends `subscription.*` notifications to `POST /v1/billing/webhook`. The handler verifies
   the signature (401 otherwise), processes each event id once, binds the account by the stored
   subscription id or else by the token (signature, expiry, one-time use), takes the plan only from
   the billed price id, ignores out-of-order and stale events and another customer taking the
   subscription over, and answers 200 with `applied`, `duplicate` or `ignored` and a reason.
3. The account's plan is the subscription's while it is active or trialing, and for 7 days after a
   failed renewal (`past_due`; `GET /v1/account` shows `graceUntil`). Then it is the account's own plan.

`GET /v1/billing/plans` is public and lists the plans, prices and limits for the pricing page.
`GET /v1/account` shows the plan, usage, the subscription (plan, status, period end, cancel at
period end; never provider ids) and the plans on sale.

## Turning it on (owner)

1. Paddle account verified (it needs the live pricing page, terms, privacy and refund policies: the
   service serves its Terms, with the refund terms in section 5, at `/app/terms` and its Privacy
   Policy at `/app/privacy`, from `pro/legal/*.md`).
2. Secrets on the host, never in the tree: `BILLING_PROVIDER=paddle`, `BILLING_API_KEY`
   (`pdl_sdbx_` for the sandbox), `BILLING_WEBHOOK_SECRET` (the notification destination's secret),
   `CHECKOUT_SECRET` (32 or more random characters; signs checkout tokens), `APP_URL` (https; the
   checkout returns to `APP_URL/billing/success` or `/billing/cancel`).
3. Products and prices as code, no dashboard clicks: the deploy runs
   `BILLING_API_KEY=… node packages/billing/scripts/paddle-catalog.ts --catalog apps/einvoice-preflight/billing/paddle-catalog.json --apply --price-ids-out price-ids.json`
   and sets `BILLING_PRICE_IDS` from `price-ids.json`. The catalog file is generated from
   `pro/plans.mjs` (`node pro/paddle-catalog.mjs --write`; a test fails when it is stale).
4. A notification destination at `https://<host>/v1/billing/webhook` for `subscription.*`.
5. A default payment link under Checkout settings.

Without all of `BILLING_PROVIDER`, the API key, the webhook secret, `CHECKOUT_SECRET` and an https
`APP_URL`, checkout and the portal answer 503 `billing_unavailable` and `GET /v1/billing/plans`
says `available: false`. `FAKE_EXTERNALS=true` (offline demo) or `APP_ENV=test` selects the signed
fake provider with a public demo secret.

## Not done yet

- A deploy: the host is the owner's pick (`docs/HOSTING.md`), so nothing syncs the catalog yet.
  The container must ship `packages/billing/src` beside `pro/` (ROADMAP "Next" 2).
- Storage: billing rows (`subscriptions`, `pending_checkouts`, `webhook_events`) are in every store,
  including `SqlStore` on SQLite or D1; `pro/store-contract.test.mjs` runs the billing contract on all
  four, and `pro/billing.test.mjs` runs one purchase end to end on SQLite.
- A web page for buying and managing the plan (part of the workspace UI, ROADMAP "Next" 4).
