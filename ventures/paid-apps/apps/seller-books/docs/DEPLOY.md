# Deploying Seller Books

One Cloudflare Worker (`seller-books`) serves the SPA and the API, with a D1 database (`seller-books`)
and Cloudflare Email Service for account mail. There is no R2 bucket: report files are parsed in the
request and only the rows are kept. The workflow
[`.github/workflows/seller-books-deploy.yml`](../../../ci-from-private/workflows/seller-books-deploy.yml) does
the whole deploy; there are no dashboard steps beyond the settings below. It was ported from
`jobshop-quote-deploy.yml` on 2026-11-26 and has not run yet.

**It runs by hand only** (Actions -> seller-books-deploy -> Run workflow). The legal pages are drafts
until the owner confirms the operator name and contact email and counsel reviews them
([BILLING.md](BILLING.md), "Turning it on"), so a merge never puts the app in front of strangers. After
launch, add `push: branches: [main]` to the workflow so every merge ships. To gate each run, add
required reviewers to the `seller-books-production` environment (Settings -> Environments).

## What a run does

1. Biome, typecheck, unit and worker tests, `scripts/provision.test.mjs` (skippable for a commit
   seller-books-ci already passed), then `pnpm build`.
2. Checks the Cloudflare token and picks the URL: `https://<SELLER_BOOKS_DOMAIN>` when that variable is
   set and its zone is on the account, else `https://seller-books.<account subdomain>.workers.dev`.
3. `scripts/provision.mjs` creates the D1 database if missing (`wrangler deploy` does not) and writes
   `dist/seller_books/wrangler.deploy.json` with its id, our names, the custom domain or workers.dev,
   and without `FAKE_EXTERNALS` (the signed fake checkout) or `TEST_SCHEMA_SQL`.
4. Applies D1 migrations **before** the new code goes live, so migrations must stay backward compatible.
5. Syncs `billing/paddle-catalog.json` to Paddle when `SELLER_BOOKS_BILLING_API_KEY` is set and reads
   the price ids back (never pasted by hand). Only items tagged `custom_data.app=seller-books` are
   touched; nothing is deleted. A Paddle failure does not block the deploy; checkout then stays off.
6. `wrangler deploy` with `APP_ENV=production`, `APP_URL`, `EMAIL_FROM` and `BILLING_PROVIDER`.
7. Copies the non-empty `SELLER_BOOKS_*` secrets to the Worker, then generates `AUTH_SECRET` once if the
   Worker has none (stored only on the Worker; it never overwrites one).
8. Smoke test: `<APP_URL>/api/health` must answer `ok: true` and `app: "seller-books"`. `email: false`
   is a warning, because with verification required in production nobody can finish signing up without
   mail; so is `billing: false` when `SELLER_BOOKS_BILLING_PROVIDER=paddle`.

Roll back with `pnpm exec wrangler rollback <version-id> --name seller-books` (the run summary prints
the version id). A rollback does not undo a migration.

## Settings

| Name | Kind | Needed for |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | every run: Workers Scripts and D1 edit (plus Zone Read, DNS and Workers Routes edit for a custom domain). Shared with the other apps. |
| `CLOUDFLARE_ACCOUNT_ID` | secret or variable | every run |
| `SELLER_BOOKS_DOMAIN` | variable | optional custom host, e.g. `books.marisstella.app` (the app serves from a host root; a path such as `marisstella.app/seller-books` needs the `BASE_PATH` handling apps/grants has, ARCHITECTURE.md "Gaps / next") |
| `SELLER_BOOKS_EMAIL_FROM` | variable | sender; default `Seller Books <no-reply@marisstella.app>`, domain onboarded to Email Service ([EMAIL.md](EMAIL.md)) |
| `SELLER_BOOKS_AUTH_SECRET` | secret | optional; overrides the generated one (32+ characters) |
| `SELLER_BOOKS_BILLING_PROVIDER` | variable | `paddle` turns checkout on once the two Paddle secrets are set; default `none` ([BILLING.md](BILLING.md)) |
| `SELLER_BOOKS_BILLING_API_KEY`, `SELLER_BOOKS_BILLING_WEBHOOK_SECRET` | secrets | paid plans |
| `SELLER_BOOKS_BILLING_PRICE_IDS` | secret | fallback only, when the catalog sync fails |

`BILLING_PROVIDER` goes to the Worker as a var, not a secret: Cloudflare refuses a secret with the same
name as a var. Do not also `wrangler secret put BILLING_PROVIDER` by hand.

## Check it locally

```bash
pnpm build
node --test scripts/provision.test.mjs
node scripts/provision.mjs --dry-run --write-config dist/seller_books/wrangler.deploy.json
```

The dry run changes nothing on Cloudflare and writes the deploy config without a database id.
