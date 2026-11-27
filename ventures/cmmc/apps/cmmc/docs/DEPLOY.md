# Deploying CMMC Workspace

One Cloudflare Worker (`cmmc-workspace`) serves the SPA and the API, with a D1 database
(`cmmc-workspace`) and an R2 bucket for evidence files (`cmmc-workspace-files`). The workflow
[`.github/workflows/priv-cmmc-deploy.yml`](../../../../../.github/workflows/priv-cmmc-deploy.yml) in this repository (ported
2026-11-27 from private-monorepo's `cmmc-deploy.yml`, which never ran: [the workspace DEPLOY.md](../../../DEPLOY.md)) does the whole
deploy; there are no dashboard steps beyond the settings below. It is a port of jobshop-quote's
deploy (`apps/jobshop-quote/docs/DEPLOY.md`, itself ported from payapps), with the differences listed
at the end.

**It runs by hand only** (Actions -> cmmc-deploy -> Run workflow, on `main`), so a merge never puts the app in
front of strangers before the items in "Before strangers sign up" are done. After launch, add
`push: branches: [main]` to the workflow so every merge ships. To gate each run, add required
reviewers to the `cmmc-production` environment (Settings -> Environments).

## What a run does

1. Biome, typecheck, unit and worker tests, `scripts/provision.test.mjs` (skippable for a commit
   cmmc-ci already passed), then `pnpm build`.
2. Checks the Cloudflare token, picks the URL: `https://<CMMC_DOMAIN>` when that variable is set and
   its zone is on the account, else `https://cmmc-workspace.<account subdomain>.workers.dev`.
3. `scripts/provision.mjs` creates the D1 database and the R2 bucket if missing (`wrangler deploy`
   does not) and writes `dist/cmmc_workspace/wrangler.deploy.json` (the Cloudflare Vite plugin names
   the build folder after the worker, with an underscore) with the database id. **R2 is required**:
   without it the run stops before anything is deployed, because evidence uploads write there.
4. Applies D1 migrations **before** the new code goes live, so migrations must stay backward
   compatible.
5. Syncs `billing/paddle-catalog.json` (Level 2 and Level 2 + Quality, monthly and annual) to Paddle
   when `CMMC_BILLING_API_KEY` is set, with `packages/billing/scripts/paddle-catalog.ts`, and passes
   the price ids it reads back to the Worker as `BILLING_PRICE_IDS` (never pasted by hand). Only
   Paddle items tagged `custom_data.app=cmmc` are touched and nothing is deleted. A Paddle failure
   does not block the deploy; checkout then stays off.
6. `wrangler deploy` with `APP_ENV=production`, `APP_URL`, `BILLING_PROVIDER` and
   `FAKE_EXTERNALS=false`. `LLM_MODEL` (`claude-haiku-5-5`) comes from `wrangler.jsonc`.
7. Copies the non-empty secrets to the Worker, then generates `AUTH_SECRET` once if the Worker has
   none (stored only on the Worker; it never overwrites one). It also signs checkout tokens.
8. Smoke test: `<APP_URL>/api/health` must answer `ok: true, app: "cmmc-workspace"`. When
   `CMMC_BILLING_PROVIDER` is `paddle` but health reports `billing: false` (a Paddle secret is
   missing), the run warns.

Roll back with `pnpm exec wrangler rollback <version-id> --name cmmc-workspace` (the run summary
prints the version id). A rollback does not undo a migration.

Checked locally on 2026-11-25 without credentials: `pnpm build`, then
`node scripts/provision.mjs --dry-run --write-config dist/cmmc_workspace/wrangler.deploy.json` and
`pnpm exec wrangler deploy --dry-run --config dist/cmmc_workspace/wrangler.deploy.json`, which lists
`env.DB (cmmc-workspace)`, `env.FILES (cmmc-workspace-files)`, `APP_ENV`, `APP_URL` and `LLM_MODEL`.
The workflow itself has not run yet. Differences from the private workflow: it defaults the host to
`cmmc.marisstella.app` (as PayApps and Seller Books use `<app>.marisstella.app`; an unreachable zone
falls back to workers.dev with a warning), and it reads only `CMMC_ANTHROPIC_API_KEY`, with no fallback
to the shared `ANTHROPIC_API_KEY`, so no AI spend starts until the owner sets the app's own key.

## Settings

| Name | Kind | Needed for |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | every run: Workers Scripts, D1 and R2 edit (plus Zone Read, DNS and Workers Routes edit for a custom domain). Shared with the other apps. |
| `CLOUDFLARE_ACCOUNT_ID` | secret or variable | every run |
| `CMMC_DOMAIN` | variable | custom host; default `cmmc.marisstella.app` |
| `CMMC_ANTHROPIC_API_KEY` | secret | AI drafts of implementation statements and policy procedures; no fallback to the shared `ANTHROPIC_API_KEY` (since the 2026-11-27 port). Without it, drafting answers 503 and the rest of the app works. |
| `CMMC_AUTH_SECRET` | secret | optional; overrides the generated one (32+ characters) |
| `CMMC_GLOBAL_DAILY_LLM_CAP_USD` | variable | optional; passed to the Worker as `GLOBAL_DAILY_LLM_CAP_USD` (dollars a day across every org, `0` stops every draft, `off` disables the cap); unset keeps the code's $1.50 ([LAUNCH-REVIEW.md](LAUNCH-REVIEW.md), section 1) |
| `CMMC_BILLING_PROVIDER` | variable | `paddle` turns checkout on once the two Paddle secrets are set; default `none` ([BILLING.md](BILLING.md)) |
| `CMMC_BILLING_API_KEY`, `CMMC_BILLING_WEBHOOK_SECRET` | secrets | paid plans |
| `CMMC_BILLING_PRICE_IDS` | secret | fallback only, when the catalog sync fails |

`BILLING_PROVIDER` goes to the Worker as a var, not a secret: Cloudflare refuses a secret with the
same name as a var. `FAKE_EXTERNALS` is stripped from the deploy config and set to `false`, so the
offline demo (and its fake billing provider) can never reach production; `createBillingProvider`
also refuses it when `APP_ENV=production`.

## Before strangers sign up

- Owner: the Terms, Privacy, Refund and Acceptable Use pages are live in the app (`docs/legal/*.md`,
  served at `/legal/:key`, accepted once per user). Operator, contact and launch authority:
  `docs/legal/OPERATOR.md` at the repository root (agents approve launch; no attorney review). After any change in substance, run
  `node docs/legal/sync-documents.mjs` and bump `POLICY_VERSION` in `src/shared/legal.ts`.
- Owner: run the workflow once and decide the host (`CMMC_DOMAIN`).
- Owner: Paddle secrets and a notification destination at `<APP_URL>/api/billing/webhook`
  (docs/BILLING.md, "Turning it on") to sell the paid plans.
- Owner: onboard the account-mail sender domain to Cloudflare Email Service (docs/EMAIL.md,
  "Turning it on"). Sign-up requires a confirmed address in production, so until `/api/health`
  reports `"email":true` (the smoke test warns) nobody can finish signing up or reset a password.

## Differences from jobshop-quote

- Account mail only (`CMMC_EMAIL_FROM`, docs/EMAIL.md): no inbound-mail domain.
- No Workers AI or rate-limiting namespaces. One daily cron (11:23 UTC, the affirmation reminder
  email), which counts toward the account's cron-trigger limit (`python3 platform/ci/cron_budget.py`).
- The smoke test checks `billing` as well as `email`.
- Settings are prefixed `CMMC_` so their keys and spend are separate from the other apps'.
