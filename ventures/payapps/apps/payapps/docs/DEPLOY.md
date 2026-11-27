# Deploying PayApps

One Cloudflare Worker (`payapps`) serves the SPA and the API, with a D1 database (`payapps`), an R2
bucket for attachments (`payapps-files`) and Cloudflare Email Service for account mail. The workflow
`.github/workflows/priv-payapps-deploy.yml` (ported from `private-monorepo` on 2026-11-27:
[ventures/payapps/DEPLOY.md](../../../DEPLOY.md)) does the whole deploy; there are no dashboard steps
beyond the secrets below.

**It runs by hand only** (Actions -> payapps-deploy -> Run workflow). Agents may run it without the
owner (the repository's [`docs/legal/OPERATOR.md`](../../../docs/legal/OPERATOR.md), "Who approves launch") once the plans clear the margin floor and a
recorded review has read every legal page against the product: the first one is
[LAUNCH-REVIEW.md](LAUNCH-REVIEW.md). After launch, add `push: branches: [main]` to the workflow so
every merge ships. To gate each run, add required reviewers to the `payapps-production` environment
(Settings -> Environments).

## What a run does

1. Job `build`, with no secrets: lint, typecheck, unit and worker tests, `scripts/provision.test.mjs`
   (skippable for a commit payapps-ci already passed), then `pnpm build`, uploaded as an artifact.
   Job `deploy` (environment `payapps-production`) downloads that build and runs only
   `scripts/provision.mjs` (owned in `.github/CODEOWNERS`) and a pinned global wrangler
   (`PAYAPPS_WRANGLER_BIN=wrangler`): no `pnpm install` next to the Cloudflare token.
2. Checks the Cloudflare token, picks the URL: `https://<PAYAPPS_DOMAIN>` when that variable is set and
   its zone is on the account, else `https://payapps.<account subdomain>.workers.dev`.
3. `scripts/provision.mjs` creates the D1 database and R2 bucket if missing (`wrangler deploy` does not)
   and writes `dist/payapps/wrangler.deploy.json` with the database id. Without R2 enabled on the account
   the deploy goes on without the `FILES` binding: attachments read as empty and uploads answer 503.
4. Applies D1 migrations **before** the new code goes live, so migrations must stay backward compatible.
5. Not in the ported workflow yet: the Paddle catalog sync. Until it is ported (its own job holding
   only the Paddle key, with `packages/billing/scripts` owned), run
   `node packages/billing/scripts/paddle-catalog.ts --catalog apps/payapps/billing/paddle-catalog.json --apply`
   from `ventures/payapps` with the key and store what it prints as `PAYAPPS_BILLING_PRICE_IDS`.
6. `wrangler deploy` with `APP_ENV=production`, `APP_URL`, `EMAIL_FROM`, `BILLING_PROVIDER`,
   `QBO_ENVIRONMENT` and `QBO_REDIRECT_URI` (`<APP_URL>/api/integrations/quickbooks/callback`).
7. Copies the non-empty `PAYAPPS_*` secrets to the Worker, then generates `AUTH_SECRET` once if the
   Worker has none (stored only on the Worker; it never overwrites one).
8. Smoke test: `<APP_URL>/api/health` must answer `ok: true`; `email: false` is a warning, because with
   verification required in production nobody can finish signing up without mail.

Roll back with `wrangler rollback <version-id> --name payapps` (the run summary prints the
version id). A rollback does not undo a migration.

## Settings

| Name | Kind | Needed for |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | every run: Workers Scripts, D1 and R2 edit (plus Zone Read, DNS and Workers Routes edit for a custom domain). Shared with grants. |
| `CLOUDFLARE_ACCOUNT_ID` | secret or variable | every run |
| `PAYAPPS_DOMAIN` | variable | optional custom host, e.g. `payapps.marisstella.app` |
| `PAYAPPS_EMAIL_FROM` | variable | sender; default `PayApps <no-reply@marisstella.app>`, domain onboarded to Email Service ([EMAIL.md](EMAIL.md)) |
| `PAYAPPS_AUTH_SECRET` | secret | optional; overrides the generated one |
| `PAYAPPS_BILLING_PROVIDER` | variable | `paddle` turns checkout on once the two Paddle secrets are set; default `none` ([BILLING.md](BILLING.md)) |
| `PAYAPPS_BILLING_API_KEY`, `PAYAPPS_BILLING_WEBHOOK_SECRET` | secrets | paid plans |
| `PAYAPPS_BILLING_PRICE_IDS` | secret | fallback only, when the catalog sync fails |
| `PAYAPPS_QBO_CLIENT_ID`, `PAYAPPS_QBO_CLIENT_SECRET`, `PAYAPPS_QBO_TOKEN_KEY` | secrets | QuickBooks ([QUICKBOOKS.md](QUICKBOOKS.md)) |
| `PAYAPPS_QBO_ENVIRONMENT` | variable | `sandbox` (default) or `production` |

`BILLING_PROVIDER` goes to the Worker as a var, not a secret: Cloudflare refuses a secret with the same
name as a var, and `wrangler.jsonc` declares it. `FAKE_EXTERNALS` is stripped from the deploy config so
the offline demo can never reach production.
