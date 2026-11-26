---
kind: milestone
date: 2026-11-26
---
# Seller Books: paid plans shipped dark, and the import bug that failed every real file (2026-11-26)

Bet #5 (`portfolio/monetization/bets.md`). Private-monorepo PR #202, merged.

## What landed
- `apps/seller-books/src/shared/plans.ts`: Free (1 platform, 1 user, 25 orders a month, hard cap),
  Side hustle $15/$150, Full time $35/$350, Business $69/$690 (4 users). Paid prices are the
  marketing site's proposal (`apps/seller-books-site/src/content.mjs` `TIERS`); the Free plan is new
  and not on the site yet.
- `services/billing/service.ts` (ported from apps/cmmc): limits on platforms imported from, users
  (pending invitations counted at invite, members at accept), the Free plan's monthly orders (an
  import is refused whole). Paid order allowances never block; `suggestedPlan` on the billing DTO.
- Checkout, portal and webhook through `packages/billing` (`@billing` alias, no lockfile change),
  `billing/paddle-catalog.json`, migration `0001_billing`, Billing page at `/o/:orgId/billing`,
  `/api/health` reports `billing`. Docs: `apps/seller-books/docs/BILLING.md`.

## The bug
`services/importers/store.ts` inserted 8 rows per statement. A sale row has 20 columns: 160 bound
parameters, over D1's 100. Every report with 5+ new sales returned 500; the authored fixtures have
at most 4 sales, so the suite never saw it. Fixed with `rowsPerInsert(table)` in `db/client.ts`
(floor(100 / columns)); the inventory route uses it too. Regression test: a 300-order Mercari file.
**Other apps with multi-row inserts should check the same arithmetic** (grep `.values(rows.slice`).

## Verification
typecheck; unit 85 passed; worker 26 passed (16 new billing tests, 1 regression); build; biome ci;
drizzle-kit check and the drift check. GitHub runners starved (`ci_starvation.py --repo
Duncan-Haywood/private-monorepo --run 45729101010`, and runs 45729131651, 45729131646: no runner).

## Next for the paid path (BILLING.md, "Turning it on")
1. Legal pages (copy `apps/cmmc/docs/legal/`, add "worksheet, not a filing; not tax advice").
2. `seller-books-deploy` workflow with the Paddle catalog sync (pattern: `cmmc-deploy`).
3. Add the Free plan to `apps/seller-books-site` pricing, or drop it if the owner prefers a trial.
4. Owner: Paddle secrets and a notification destination.
