# Deploying PayApps from this repository

The app's own deploy steps (what the workflow provisions, every secret and variable) are in
[apps/payapps/docs/DEPLOY.md](apps/payapps/docs/DEPLOY.md). This file says what the move to this
repository changes (task `move-payapps-public`, `portfolio/work/tasks.yaml`).

## Done on 2026-11-27

- The code, the marketing site and the packages they import are here, under the all-rights-reserved
  notice, with `.github/workflows/payapps-ci.yml` (read-only, no secrets) running the same checks
  private-monorepo's `payapps-ci`, `payapps-site-ci`, `billing-ci` and `qbo-sync-ci` ran.
- The pre-publication audit's output for the copied commit:
  [docs/reports/2026-11-27-move-payapps-public.md](../../docs/reports/2026-11-27-move-payapps-public.md).

## The deploy workflow (ported 2026-11-27)

`.github/workflows/priv-payapps-deploy.yml`, by hand only (Actions -> payapps-deploy -> Run workflow,
on `main`), until a first run succeeds; then add `push: branches: [main]`. What changed from the
private copy:

- **Two jobs.** `build` has no secrets and no environment: install, checks, `pnpm build`, and
  `dist/` uploaded as an artifact (with `.assetsignore`). `deploy` (environment
  `payapps-production`) downloads it and runs only `apps/payapps/scripts/provision.mjs` (now owned in
  `.github/CODEOWNERS`) and `wrangler@4.165.0` installed globally, so no dependency install or
  product code runs next to the Cloudflare token. `provision.mjs` takes `PAYAPPS_WRANGLER_BIN` for
  that (default still `pnpm exec wrangler`; tested).
- **No Paddle catalog sync yet.** It runs `packages/billing` code with the Paddle key, which
  `ci-policy` refuses for unowned code; listing it as an accepted exception was not done by an agent.
  Port it as its own job holding only the Paddle key once `packages/billing/scripts/` and the three
  `src` files it imports are owned. Until then `PAYAPPS_BILLING_PRICE_IDS` is copied to the Worker
  ([apps/payapps/docs/DEPLOY.md](apps/payapps/docs/DEPLOY.md), step 5). Paid plans are dark anyway.
- Runner: `vars.CI_RUNNER || 'ubuntu-latest'` (this repository's allowed expression), not CodeBuild.

**`sync-from-private.sh` would overwrite `provision.mjs`'s `PAYAPPS_WRANGLER_BIN` change** (and every
other edit made here). Since the port, build PayApps here; do not refresh from private-monorepo
without carrying the change across.

Settings, in the `payapps-production` environment (or as repository secrets):

| Name | Kind | Status here |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` (or `CLOUDFLAREAPITOKEN`), `CLOUDFLARE_ACCOUNT_ID` (or `CLOUDFLAREACCOUNTID`) | secret | the catalogue deploy's names; the token needs Workers Scripts, D1 and R2 edit (or a token minted for it by `platform/ci/cloudflare_mint/`). The first step fails with a clear error if either is missing |
| `PAYAPPS_DOMAIN` | variable | optional; workers.dev without it |
| `PAYAPPS_BILLING_PROVIDER` | variable | `none` until the owner sets the Paddle keys |
| `PAYAPPS_BILLING_API_KEY`, `PAYAPPS_BILLING_WEBHOOK_SECRET`, `PAYAPPS_BILLING_PRICE_IDS` | secret | owner-held, Paddle |
| `PAYAPPS_QBO_*` | secret / variable | optional, QuickBooks |

**Payments stay behind for now.** The AWS payments account trusts only `private-monorepo`'s OIDC
tokens (`products-to-public-repo` notes). PayApps' Paddle checkout and webhook run inside its own
Worker on the secrets above and do not use that AWS account, so the Worker can deploy from here; the
payments-account infrastructure stays in `private-monorepo`, as `LICENSING_TRANSITION.md` says.

## Then

1. Done 2026-11-27: port the deploy workflow (its own PR). Next: run it once by hand and record the URL.
2. Remove `apps/payapps`, `apps/payapps-site` and the four packages from `private-monorepo` in a PR
   there, leaving a pointer here (the other apps that import `packages/billing` or
   `packages/admin-metrics` keep private copies until they move too).
3. Done 2026-11-27: `portfolio/monetization/models.yaml`, `portfolio/flagships.yaml`, `bets.md`,
   the router's Deepen task and `roadmap_claim.py` point at `ventures/payapps/apps/payapps`
   (claims are `claim/payapps/*` branches on this repository from now on; the old ones in
   `private-monorepo` were all past their six hours).
