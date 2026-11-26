---
kind: milestone
date: 2026-11-26
---
# Seller Books: a by-hand deploy workflow, so the paid path can ship (2026-11-26)

Bet #5 (`portfolio/monetization/bets.md`). Private-monorepo PR #225, merged; claim
`claim/seller-books/deploy-workflow`.

## Why this, this run
payapps (bet #1) and jobshop-quote (bet #2) had a dozen parallel runs on 2026-11-26. Their free
ROADMAP items were mostly marked "if shops ask", and their launch blockers belong to the owner.
Seller Books had billing built and dark (PR #202), legal pages (#203) and account email (#214), but
no way to deploy: `docs/BILLING.md` "Turning it on" step 2 read "not built yet". Without a deploy
workflow the owner could not turn the product on even with the Paddle keys in hand.

## What landed
- `.github/workflows/seller-books-deploy.yml`: `workflow_dispatch` only, `contents: read`. Ported
  from `jobshop-quote-deploy.yml` without R2 (Seller Books stores no files), the Anthropic key (it
  calls no model) and inbound email. Settings carry a `SELLER_BOOKS_*` prefix (domain, email sender,
  billing provider, Paddle key, webhook secret, price-id fallback, optional auth secret).
  The smoke test warns on `email:false`, and on `billing:false` when Paddle was asked for. The
  second warning is new; the sibling workflows don't have it.
- `apps/seller-books/scripts/provision.mjs` + `provision.test.mjs` (4 tests, run in seller-books-ci):
  creates D1 `seller-books` and writes `dist/seller_books/wrangler.deploy.json` without
  `FAKE_EXTERNALS`/`TEST_SCHEMA_SQL`. It throws if the database is still missing after the create.
- `apps/seller-books/docs/DEPLOY.md` (steps, settings table, local dry run). BILLING.md step 2
  and 3, ARCHITECTURE.md "Gaps / next" and the README are updated to match.

## Verification
`run_workflow_locally.py --repo-root /home/user/private-monorepo seller-books-ci`: 8/8 `run:` steps
passed (biome, typecheck, unit, worker, provision tests, build, migration drift). A provisioning dry
run against the real build output produced the expected config. The GitHub job never got a runner
(`ci_starvation.py --repo Duncan-Haywood/private-monorepo --run 45746225026`). **The deploy workflow
itself has never run against Cloudflare**; the first run is the owner's.

## Next for Seller Books
1. Owner: run `seller-books-deploy` once (Cloudflare token is shared with the other apps), confirm
   the operator name and contact email in `docs/legal/*.md`, and set the Paddle settings
   (`docs/DEPLOY.md`, "Settings").
2. `BASE_PATH` handling if the app is to live at `marisstella.app/seller-books` rather than a host
   such as `books.marisstella.app` (ARCHITECTURE.md, "Gaps / next").
3. One real export per marketplace through the importers (IMPORTERS.md: no header row is confirmed).
4. An e2e suite (sign-up → lot → imports → P&L → worksheet), today a hand-run smoke test.
