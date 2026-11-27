# Deploying Seller Books from this repository

The app's own deploy steps are in [apps/seller-books/docs/DEPLOY.md](apps/seller-books/docs/DEPLOY.md).
This file says what the move to this repository changes (task `move-seller-books-public`,
`portfolio/work/tasks.yaml`).

## Done on 2026-11-27

- The app, the marketing site and the two packages the app imports are here, under the
  all-rights-reserved notice, with `.github/workflows/seller-books-ci.yml` (read-only, no secrets)
  running the checks private-monorepo's `seller-books-ci` ran, plus the site's tests (the site had no
  CI there) and the two packages'.
- The pre-publication audit's output: [docs/reports/2026-11-27-move-seller-books-public.md](../../docs/reports/2026-11-27-move-seller-books-public.md).

## Not yet

1. **The deploy workflow: ported 2026-11-27.** [`.github/workflows/priv-seller-books-deploy.yml`](../../.github/workflows/priv-seller-books-deploy.yml),
   manual and main-only, after the allowlist PR for its secrets (PR #19653, the pattern PayApps
   followed in PRs #19610 and #19617). `/ventures/seller-books/`
   now has a code owner, because the deploy job runs the venture's code with Cloudflare credentials
   (`ci_policy_check.py`).
2. **The legal pages: done 2026-11-27.** The launch review `docs/legal/OPERATOR.md` asks for is
   [apps/seller-books/docs/LAUNCH-REVIEW.md](apps/seller-books/docs/LAUNCH-REVIEW.md) (private-monorepo PR 486):
   margins 49-62% at twice the order allowance, and the four pages read against the schema, routes and
   email sends, with the gaps fixed (policy version `2026-11-27.2`). So the first deploy may open
   sign-ups, as PayApps' does; paid plans stay dark until the Paddle account is verified.
3. **The browser suite.** The private CI's Playwright job (`scripts/e2e-run.sh`) is not ported: it
   installs Chromium with `--with-deps` on each run. Run it locally (`pnpm test:e2e`) after touching
   the client.

## First deploy (2026-11-27, run 45973427499)

Dispatched on `main` at `b2c4d390` (PR #19662). Checks, build, provisioning (D1 `seller-books` created),
D1 migrations, the deploy (version `4692ed12-1b55-4c8c-b735-33aabbd6d4bb`) and the smoke test all
passed: `https://seller-books.duncan-andrew-haywood.workers.dev/api/health` answered
`{"ok":true,"app":"seller-books","billing":false,"email":true}`, so sign-up email works. AUTH_SECRET
was generated on the Worker; no `SELLER_BOOKS_*` secrets are set, so paid plans are dark.

The workflow now defaults `APP_DOMAIN` to `seller-books.marisstella.app` (as PayApps does with
`payapps.marisstella.app`, PR #19642). The next run attaches it as a Workers custom domain and turns
workers.dev off, so link to the custom domain, not the address above. The custom domain answered on 2026-11-27
(`https://seller-books.marisstella.app/api/health`: `{"ok":true,"app":"seller-books","billing":false,"email":true}`).

## Sign-ups open on the public front doors (2026-11-27, `launch-signups-open`)

The marketing site (`apps/seller-books-site`) is not deployed (`https://marisstella.app/seller-books/`
answers 404), so the live front doors are the free reseller tools and the catalogue pages. They now
link to `https://seller-books.marisstella.app/signup?from=<page>`:

- the 13 fee-calculator and guide pages and their 10 `llms.txt` files, written by one switch,
  [`ventures/reseller-books/seller-books-cta.mjs`](../reseller-books/seller-books-cta.mjs)
  (set `PAID_PLANS_ON` when Paddle checkout is live and rerun it);
- `industries/online-sellers/` (`platform/pages/industry-online-sellers.mjs`): "Open · free on one
  platform", the Free plan's limits from `src/shared/plans.ts`, a sign-up button;
- the home finder and `/products/` (`platform/pages/business.mjs`): Seller Books and PayApps are
  `live`, each with a `plan` sentence saying paid plans are not on sale yet.

Still to do: the marketing site's own CTAs, once it is deployed or folded into the app's public pages.

## Then

Remove `apps/seller-books` and `apps/seller-books-site` from `private-monorepo` in a PR there, leaving
a pointer here, and point `portfolio/monetization/models.yaml`, `bets.md` and `roadmap_claim.py` at
`ventures/seller-books/apps/seller-books`.
