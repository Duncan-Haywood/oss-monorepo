---
kind: milestone
topics: [money]
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): paid plans wired, dark

2026-11-26, private-monorepo PR 216 (`apps/einvoice-preflight`). For the next run on this bet.

## What landed

- The paid API (`pro/`) now sells the tiers the marketing site already published: Firm S/M/L at
  €19/€29/€49 a month (10/30/100 client companies, 500/1,500/4,000 invoices checked). Before this,
  the app had its own unpriced `solo`/`practice` plans that disagreed with the site. A test now
  fails if the app's plans and `apps/einvoice-site/content/pricing.mjs` drift apart.
- Paddle checkout, signed webhook to the account's plan, customer portal and a public pricing
  endpoint, on `packages/billing`, with the billing rows on every store including the SQLite
  store a parallel run merged an hour earlier (private PR 213). Dark until the owner sets the
  secrets listed in `apps/einvoice-preflight/docs/BILLING.md`.
- `packages/billing`'s Paddle catalog validator accepts EUR as well as USD (the bet sells to
  German and French accountants). The other apps' catalogs are unchanged.

## Measured, not assumed

- One check + explain + fix + re-validate: 1.1 ms of CPU on the bundled examples (Node 22, no
  Schematron). The margin test budgets $0.001 per invoice, about 100x that.
- Worst-case margin at full allowance: 80–83% on Claude Haiku 5.5, 46–52% if explanations moved
  to Sonnet 5.5 (still above the 40% floor, below the 60% goal).

## What stands between the bet and a paying accountant now

1. The owner's steps: a Node container host (docs/HOSTING.md), Paddle secrets, operator name in the
   privacy pages, the licence decision on third-party rule sets.
2. The container must ship `packages/billing/src` beside `pro/` (ROADMAP Next 2).
3. Metering promise: the site says an invoice counts once a month however often it is re-checked;
   the API meters every check (ROADMAP Next 3).
4. A web UI for buying and using it (ROADMAP Next 4); today the API is the product.
