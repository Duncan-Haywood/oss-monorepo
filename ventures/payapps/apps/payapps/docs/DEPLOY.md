# Deploying PayApps

One Cloudflare Worker (`payapps`) serves the SPA and the API, with a D1 database (`payapps`), an R2
bucket for attachments (`payapps-files`) and Cloudflare Email Service for account mail. The workflow
`payapps-deploy.yml` does the whole deploy (in `private-monorepo` until it is ported here: [ventures/payapps/DEPLOY.md](../../../DEPLOY.md)); there are no dashboard steps beyond the secrets below.

**It runs on every merge to `main` that touches `ventures/payapps/`** (Markdown-only changes excepted;
added 2026-11-27 after seven good manual runs) **and by hand** (Actions -> payapps-deploy -> Run
workflow). A push run always runs the full checks. Agents may run it without the
owner (the repository's [`docs/legal/OPERATOR.md`](../../../docs/legal/OPERATOR.md), "Who approves launch") once the plans clear the margin floor and a
recorded review has read every legal page against the product: the first one is
[LAUNCH-REVIEW.md](LAUNCH-REVIEW.md). Because every merge ships, a migration must stay backward
compatible with the code before it (migrations apply before the new Worker goes live). To gate each
run, add required reviewers to the `payapps-production` environment (Settings -> Environments).

## What a run does

1. Lint, typecheck, unit and worker tests, `scripts/provision.test.mjs` (skippable for a commit
   payapps-ci already passed), then `pnpm build`.
2. Checks the Cloudflare token, picks the URL: `https://<PAYAPPS_DOMAIN>` when that variable is set and
   its zone is on the account, else `https://payapps.<account subdomain>.workers.dev`.
3. `scripts/provision.mjs` creates the D1 database and R2 bucket if missing (`wrangler deploy` does not)
   and writes `dist/payapps/wrangler.deploy.json` with the database id. Without R2 enabled on the account,
   or with a token that has no R2 permission (Cloudflare answers "Authentication error [code: 10000]",
   as on the first run here, 45947552522), the deploy goes on without the `FILES` binding and warns:
   attachments read as empty and uploads answer 503; `/api/health` then answers `"files": false`
   and every plan's storage line reads "(not switched on yet)". Add Workers R2 Storage: Edit to the token and re-run.
4. Applies D1 migrations **before** the new code goes live, so migrations must stay backward compatible.
5. Syncs `billing/paddle-catalog.json` to Paddle when `PAYAPPS_BILLING_API_KEY` is set and reads the
   price ids back (never pasted by hand).
6. `wrangler deploy` with `APP_ENV=production`, `APP_URL`, `EMAIL_FROM`, `BILLING_PROVIDER`,
   `QBO_ENVIRONMENT` and `QBO_REDIRECT_URI` (`<APP_URL>/api/integrations/quickbooks/callback`).
7. Copies the non-empty `PAYAPPS_*` secrets to the Worker, then generates `AUTH_SECRET` once if the
   Worker has none (stored only on the Worker; it never overwrites one).
8. Smoke test: `<APP_URL>/api/health` must answer `ok: true`; `email: false` is a warning, because with
   verification required in production nobody can finish signing up without mail.

Roll back with `pnpm exec wrangler rollback <version-id> --name payapps` (the run summary prints the
version id). A rollback does not undo a migration.

## Settings

| Name | Kind | Needed for |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | every run: Workers Scripts, D1 and R2 edit (plus Zone Read, DNS and Workers Routes edit for a custom domain). Shared with grants. |
| `CLOUDFLARE_ACCOUNT_ID` | secret or variable | every run |
| `PAYAPPS_DOMAIN` | variable | custom host; default `payapps.marisstella.app` (2026-11-27). If the token cannot read that zone the run warns and deploys on `payapps.<account subdomain>.workers.dev` |
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
