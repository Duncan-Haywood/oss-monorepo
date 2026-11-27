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
   followed in PRs #19610 and #19617). Its first run records the URL here. `/ventures/seller-books/`
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

## Then

Remove `apps/seller-books` and `apps/seller-books-site` from `private-monorepo` in a PR there, leaving
a pointer here, and point `portfolio/monetization/models.yaml`, `bets.md` and `roadmap_claim.py` at
`ventures/seller-books/apps/seller-books`.
