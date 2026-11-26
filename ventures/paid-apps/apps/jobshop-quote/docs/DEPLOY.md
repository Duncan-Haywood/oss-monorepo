# Deploying Job Shop Quote

One Cloudflare Worker (`jobshop-quote`) serves the SPA and the API, with a D1 database
(`jobshop-quote`), an R2 bucket for drawings, CAD files and sent quote PDFs (`jobshop-quote-files`),
Workers AI for drawing text, two Workers Rate Limiting namespaces (1201-1202), a daily cron for
quote expiry and Cloudflare Email Service for account and quote mail. The workflow
[`.github/workflows/jobshop-quote-deploy.yml`](../../../ci-from-private/workflows/jobshop-quote-deploy.yml)
does the whole deploy; there are no dashboard steps beyond the settings below. It is a port of
payapps' deploy (`apps/payapps/docs/DEPLOY.md`), with the differences listed at the end.

**It runs by hand only** (Actions -> jobshop-quote-deploy -> Run workflow), so a merge never puts the
app in front of strangers before the items in "Before strangers sign up" are done. After launch, add
`push: branches: [main]` to the workflow so every merge ships. To gate each run, add required
reviewers to the `jobshop-quote-production` environment (Settings -> Environments).

## What a run does

1. Lint, typecheck, unit and worker tests, `scripts/provision.test.mjs` (skippable for a commit
   jobshop-quote-ci already passed), then `pnpm build`.
2. Checks the Cloudflare token, picks the URL: `https://<JOBSHOP_DOMAIN>` when that variable is set
   and its zone is on the account, else `https://jobshop-quote.<account subdomain>.workers.dev`.
3. `scripts/provision.mjs` creates the D1 database and the R2 bucket if missing (`wrangler deploy`
   does not) and writes `dist/jobshop_quote/wrangler.deploy.json` (the Cloudflare Vite plugin names the
   build folder after the worker, with an underscore) with the database id. **R2 is required**: without
   it the run stops before anything is deployed, because RFQ uploads and "Mark sent" both write there.
4. Applies D1 migrations **before** the new code goes live, so migrations must stay backward
   compatible.
5. Syncs `billing/paddle-catalog.json` to Paddle when `JOBSHOP_BILLING_API_KEY` is set and reads the
   price ids back (never pasted by hand).
6. `wrangler deploy` with `APP_ENV=production`, `APP_URL`, `EMAIL_FROM`, `BILLING_PROVIDER` and
   `INBOUND_EMAIL_DOMAIN`. `LLM_MODEL` (`claude-haiku-5-5`) and the LLM spend caps come from
   `wrangler.jsonc`.
7. Copies the non-empty secrets to the Worker, then generates `AUTH_SECRET` once if the Worker has
   none (stored only on the Worker; it never overwrites one).
8. Smoke test: `<APP_URL>/api/health` must answer `ok: true, app: "jobshop-quote"`; `email: false` is
   a warning, because with verification required in production nobody can finish signing up without
   mail.

Roll back with `pnpm exec wrangler rollback <version-id> --name jobshop-quote` (the run summary prints
the version id). A rollback does not undo a migration.

Checked locally on 2026-11-25 without credentials: `pnpm build`, then
`node scripts/provision.mjs --dry-run --write-config dist/jobshop_quote/wrangler.deploy.json` and
`pnpm exec wrangler deploy --dry-run --config dist/jobshop_quote/wrangler.deploy.json` list every
binding above. The workflow itself has not run yet.

## Settings

| Name | Kind | Needed for |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | every run: Workers Scripts, D1 and R2 edit (plus Zone Read, DNS and Workers Routes edit for a custom domain). Shared with grants and payapps. |
| `CLOUDFLARE_ACCOUNT_ID` | secret or variable | every run |
| `JOBSHOP_DOMAIN` | variable | optional custom host, e.g. `quote.marisstella.app` |
| `JOBSHOP_EMAIL_FROM` | variable | sender; default `Job Shop Quote <no-reply@marisstella.app>`, domain onboarded to Email Service ([EMAIL.md](EMAIL.md)) |
| `JOBSHOP_ANTHROPIC_API_KEY` | secret | AI extraction of RFQs; falls back to the shared `ANTHROPIC_API_KEY`. Without either, "Extract with AI" answers 503 and the rest of the app works. |
| `JOBSHOP_AUTH_SECRET` | secret | optional; overrides the generated one |
| `JOBSHOP_BILLING_PROVIDER` | variable | `paddle` turns checkout on once the two Paddle secrets are set; default `none` ([BILLING.md](BILLING.md)) |
| `JOBSHOP_BILLING_API_KEY`, `JOBSHOP_BILLING_WEBHOOK_SECRET` | secrets | paid plans |
| `JOBSHOP_BILLING_PRICE_IDS` | secret | fallback only, when the catalog sync fails |
| `JOBSHOP_INBOUND_EMAIL` | variable | `on` makes the deploy apply `email-routing.json` (Email Routing on `rfq.marisstella.app`, subaddressing, the rule `rfq@` → this worker) and then turn RFQs by email on; a failed setup leaves them off ([EMAIL.md](EMAIL.md), "Routing as code") |
| `CLOUDFLARE_EMAIL_ROUTING_TOKEN` | secret | for that step: Zone → Email Routing Rules Edit, Zone Settings Edit, DNS Read on the zone; falls back to the deploy token |
| `JOBSHOP_INBOUND_EMAIL_DOMAIN` | variable | only for a domain routed by hand (an apex catch-all to the worker); the routing step's domain wins |

`BILLING_PROVIDER` and `INBOUND_EMAIL_DOMAIN` go to the Worker as vars, not secrets: Cloudflare
refuses a secret with the same name as a var, and `wrangler.jsonc` declares them. `FAKE_EXTERNALS` is
stripped from the deploy config so the offline demo can never reach production.

## Before strangers sign up

- Owner: the Terms, Privacy, Refund and Acceptable Use pages are live in the app (`docs/legal/*.md`,
  served at `/legal/:key`, accepted once per user) but are drafts: confirm the operator name (copied
  from grants: Mary Stella Labs, LLC, New Mexico), fill in the contact email, and have counsel review
  them. After any change in substance, run `node docs/legal/sync-documents.mjs` and bump
  `POLICY_VERSION` in `src/shared/legal.ts` so every user is asked to accept the new version.
- Owner: run the workflow once, onboard the sender domain so `/api/health` reports `email: true`, and
  decide the host (`JOBSHOP_DOMAIN`).
- Owner: Paddle secrets and a notification destination (docs/BILLING.md) to sell the paid plans.

## Differences from payapps

- R2 is required (payapps deploys without it and answers 503 on uploads).
- An Anthropic key is synced (payapps calls no LLM); the app's own key wins over the shared one.
- `INBOUND_EMAIL_DOMAIN` replaces payapps' QuickBooks settings.
- `BILLING_PROVIDER` is read from a variable only, not also from a secret of the same name.
