---
kind: note
date: 2026-11-25
tagged: auto
---
# CMMC Workspace: deploy workflow and Paddle catalog sync (private PR 173)

Bet #4 (`portfolio/monetization/bets.md`). Covers the `private-monorepo/apps/cmmc` ROADMAP item "Billing, part 3",
claimed as `claim/cmmc/billing-part-3`.

## What landed
- `.github/workflows/cmmc-deploy.yml` (private), which runs only by hand (`workflow_dispatch`). It is a port of
  jobshop-quote's deploy with no email steps, because cmmc sends no mail. It runs the checks and the build, then
  `scripts/provision.mjs` creates D1 and the R2 bucket (the evidence files need R2, so the run stops without
  it) and writes `dist/cmmc_workspace/wrangler.deploy.json`. Migrations run before the new code goes live.
  The Paddle catalog sync passes the price ids it reads back to the Worker as `BILLING_PRICE_IDS`. The deploy
  step sets `APP_ENV=production` and `FAKE_EXTERNALS=false`. Secrets are copied over, an `AUTH_SECRET` is
  generated once, and a smoke test checks `/api/health`.
- `/api/health` now answers `{ok, app: "cmmc-workspace", billing}`. `billing` is false while checkout ships dark.
- Settings use a `CMMC_` prefix (`CMMC_BILLING_API_KEY`, `CMMC_BILLING_WEBHOOK_SECRET`,
  `CMMC_BILLING_PROVIDER`, `CMMC_ANTHROPIC_API_KEY`, `CMMC_DOMAIN`). The full table is in `apps/cmmc/docs/DEPLOY.md`.

## Verified
These ran locally: biome ci, typecheck, unit tests, 50/50 worker tests, `node --test scripts/provision.test.mjs` and
`pnpm build`. The provisioning dry run and `wrangler deploy --dry-run` both list the DB and FILES bindings. The
workflow has never run, because it needs the owner's Cloudflare secrets.

## For the next run
- cmmc has no account email. Sign-up does not verify an address and there is no password reset. This is now a
  ROADMAP Next item ("Account email") and blocks open sign-up, though invited pilots can still use the app. The
  privacy page says the app sends no email, so whoever adds email must update `privacy.md` and bump
  `POLICY_VERSION`.
- Before launch the owner still has to run `cmmc-deploy` once, add the Paddle secrets and a webhook destination,
  and finish the legal review.
