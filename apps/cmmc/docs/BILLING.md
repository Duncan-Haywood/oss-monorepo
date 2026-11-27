# CMMC Workspace billing

Paid plans ship **dark**. Until the owner sets the Paddle secrets below, `createBillingProvider`
returns `null`: checkout answers 503, the Billing tab says paid plans are not on sale yet, and every
organization is on the free Level 1 plan. Nothing in this repository holds a key.

Built on [`packages/billing`](../../../packages/billing/README.md), imported as source through the
`@billing` path alias (`aliases.ts`, `tsconfig.json`), so `package.json` and the lockfile are
unchanged. Checkout, portal and webhook handling are ported from `apps/jobshop-quote` (the same
rules as `apps/payapps`).

## Plans (`src/shared/plans.ts`)

| Plan | Monthly | Annual | Level 2 | ISO 9001 | Users | AI drafts / month | Evidence | Sold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Level 1 (`free`) | $0 | – | read only | read only | 1 | 10 | 250 MB | no (default) |
| Level 2 (`level2`) | $249 | $2,689 | yes | read only | 3 | 150 | 10 GB | yes |
| Level 2 + Quality (`team`) | $399 | $4,309 | yes | yes | 10 | 400 | 50 GB | yes |
| Complimentary (`comp`) | $0 | – | yes | yes | unlimited | fair use | 50 GB | no (operator grant) |

Prices are the Level 2 proposals in the public repository's `portfolio/monetization/models.yaml`
(row `app: private-monorepo/apps/cmmc`), set under FutureFeed ($99/$399 a month) and PreVeil Pass
($450 a month for 3 users) and against a consultant's $3k-25k SSP and POA&M. They are untested
hypotheses. Two changes from that row, both recorded there:

- **Level 1 is free, not $49.** Level 1 is 15 safeguards and a pass/fail result; as a free plan it
  is the front door the models row already asks for ("a free Level 1 self-assessment page"), and
  the upgrade path is recording Level 2.
- **The $399 tier is "Level 2 + Quality"** (renamed from "Level 2 Team" on 2026-11-25, when the
  ISO 9001:2015 clause checklist shipped; the key stays `team` so the Paddle catalog entry keeps its
  id). It adds recording the checklist to the Team limits (10 users, 400 drafts, 50 GB). The
  checklist is readable on every plan, so a Level 2 shop sees what the upgrade is. AS9100D's
  aerospace additions are not in it yet.

`src/shared/plans.test.ts` fails CI when a paid plan falls under the 40% margin floor at full
allowance. The cost model is deliberately pessimistic: every draft priced at Opus list prices with
8k tokens in and the 4k-token cap out (about $0.11; the app runs on Haiku, about 40 times cheaper),
full evidence storage at R2's $0.015 per GB-month, $30 or $50 of the owner's support time per
org-month, hosting, Paddle's 5% + $0.50 and a 3% refund reserve. Both paid plans clear the floor by
a wide margin. `billing/paddle-catalog.json` is generated from `PLAN_LIST` (the same test fails
when it is stale; regenerate with `UPDATE_PADDLE_CATALOG=1`, see the test's header).

## What the limits do

- **Level 2 recording** (free plan, or a lapsed subscription): changing a Level 2 requirement's
  answer, drafting or accepting its statement, attaching evidence to it, and adding or editing a
  POA&M item for it answer 402 `payment_required`. Level 1 is never limited this way.
- **AI drafts** over the month's allowance (calendar month, UTC): 402 before the model is called.
  Drafts are counted from the `control.draft` audit rows, so two drafts started at the same instant
  can both pass the last slot; one draft costs well under a cent on Haiku, so this is not guarded
  further.
- **Evidence** over the plan's storage: 402 before the upload.
- **A new member** over the user limit: 402.
- **Nothing is ever hidden or deleted.** Reading every answer, the score, the SSP and its download,
  the POA&M and its CSV, evidence downloads and deletes keep working on every plan, so a lapsed
  customer is never locked out of their own assessment records.

A subscription grants its plan while `active`, `trialing` or `comp`, and while `past_due` for 7 days
from the first failed renewal (the Billing tab shows the deadline). After that, or when
`canceled`/`paused`, the free Level 1 limits apply.

## Routes

| Route | Who | What |
| --- | --- | --- |
| `GET /api/billing/plans` | anyone | Public plan list (for a pricing page) |
| `POST /api/billing/webhook` | Paddle | Signature-verified; always 200 once verified |
| `GET /api/orgs/:orgId/billing` | members | Plan, status, usage, limits, plans |
| `POST /api/orgs/:orgId/billing/checkout` | admins | `{plan, interval, promoCode?}` → hosted checkout URL |
| `POST /api/orgs/:orgId/billing/portal` | admins | Paddle customer portal URL |

The webhook is mounted before the Origin check and the session (`src/worker/app.ts`). It follows
`packages/billing` exactly: the org is bound only by an existing subscription id or a signed,
unexpired, single-use checkout token (never `custom_data.orgId`); the plan comes only from the billed
price; `comp` is never granted by a webhook; another customer cannot take over an org's
subscription; events are idempotent on `(provider, event id)` and an event that threw is retried on
redelivery. `test/worker/billing.test.ts` covers the limits, checkout and the webhook's binding
rules. Checkout and the portal return to `/?tab=billing`.

## Turning it on (owner steps)

1. Terms, privacy and refund pages with the liability notes (no certification claim, no CUI), which
   Paddle's verification and the models row both require first. Done as drafts (2026-11-25,
   `docs/legal/*.md`, served at `/legal/:key`); the owner confirms the operator name and contact
   email and has counsel review them before launch. Give Paddle the `/legal/terms`,
   `/legal/privacy` and `/legal/refunds` URLs on the cmmc host.
2. The deploy workflow (`cmmc-deploy`, [DEPLOY.md](DEPLOY.md)) syncs `billing/paddle-catalog.json`
   to Paddle with `packages/billing/scripts/paddle-catalog.ts` and passes the price ids read back to
   the Worker as `BILLING_PRICE_IDS`, as `apps/payapps` and `apps/jobshop-quote` do. Built
   2026-11-25; it runs once `CMMC_BILLING_API_KEY` is set.
3. Repository settings (owner only), copied to the Worker by the deploy: secrets
   `CMMC_BILLING_API_KEY` and `CMMC_BILLING_WEBHOOK_SECRET`, plus the variable
   `CMMC_BILLING_PROVIDER=paddle`. `/api/health` then reports `billing: true`. `AUTH_SECRET` (it also signs checkout tokens) must be 32+ characters.
4. A Paddle notification destination at `https://<cmmc host>/api/billing/webhook` for
   `subscription.*` and `transaction.completed`.

## Operators

Grant a pilot or partner unlimited use with a `comp` row:

```sql
INSERT INTO subscriptions (org_id, plan_key, status, cancel_at_period_end, created_at, updated_at)
VALUES ('org_…', 'comp', 'comp', 0, unixepoch() * 1000, unixepoch() * 1000);
```

## Local demo

`.dev.vars.example` sets `FAKE_EXTERNALS=true`, which selects the signed fake provider: checkout
returns to `/?tab=billing&checkout=success&fake_checkout=…` without charging (no webhook is sent, so
the plan does not change). The fake is refused when `APP_ENV=production`.
