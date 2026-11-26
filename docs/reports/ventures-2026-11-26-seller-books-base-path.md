---
kind: milestone
date: 2026-11-26
---
# Seller Books: served under a path prefix, so it can share marisstella.app (2026-11-26)

Bet #5 (`portfolio/monetization/bets.md`). Private-monorepo PR #280, claim
`claim/seller-books/base-path`.

## Why this, this run
The route drew ventures. Payapps (bet #1) was saturated: both halves of its one free suite item
(job costing part 3: QuickBooks purchase orders, payroll report upload) were claimed by parallel runs
in the 60 seconds before this run's claims, and its other free items are "if people ask". Jobshop-quote's
free items are also "if shops ask", and its launch item is owner steps. Seller Books' architecture doc
listed an agent-doable launch gap: the app only ran at a host root, while its marketing site
(`apps/seller-books-site`) already owns `https://marisstella.app/seller-books`.

## What landed
- `BASE_PATH`, ported from apps/grants: `src/shared/base-path.ts` and `src/client/lib/base-path.ts`.
  It sets Vite `base`, the router basepath and `apiUrl()` inside `api()`, so every call, the
  Schedule C CSV link and the plain `<a>` links follow it.
- `vite.config.ts` writes `assets.base_path`, `run_worker_first` and the var into the built
  `wrangler.json`. The new `src/worker/http.ts` strips the prefix. Outside the prefix it answers 404,
  except `GET /`, which 302s to the app.
- Better Auth endpoints and the session cookie are scoped to the prefix. `baseURL` is now APP_URL's
  **origin** + BASE_PATH. While driving the app in a browser this run found that an APP_URL without
  the path makes Better Auth route by the wrong path and 404 every sign-up.
- A real bug that only shows under a prefix: checkout and portal return URLs were
  `new URL("/o/…", APP_URL)`, which drops APP_URL's path. They are now a string join (`appLink`).
  apps/grants had no such call. **Check the other apps for the same pattern before any of them moves
  to a path.**

## Verification
typecheck, biome, 141 unit and 63 worker tests (new `test/worker/base-path.test.ts`), a
`BASE_PATH=/seller-books/app` build, then Chromium against `vite preview` of that build. The run
covered sign-up, sign-in, legal accept, new shop, P&L, the Schedule C page and CSV, and sign-out.
Every request stayed under the prefix and there were no console errors. GitHub CI never got a runner;
`run_workflow_locally.py seller-books-ci` ran instead (run record notes).

## Next for Seller Books
1. Wire it into the deploy: `seller-books-deploy.yml` builds with `BASE_PATH`, sets `APP_URL` with the
   path, and `scripts/provision.mjs` writes a Workers route `marisstella.app/seller-books/app*` (more
   specific than the site's `/seller-books*`) instead of a custom domain (`docs/DEPLOY.md`, "Path prefix").
2. Point the site's sign-up buttons at `/seller-books/app/signup` once the app is live there.
3. Still open from earlier: real marketplace exports for the importer fixtures, and the owner's
   deploy and Paddle settings.
