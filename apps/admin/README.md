# Owner Console (apps/admin)

One dashboard for the owner across every product: totals, a card per product, a recent sign-ups
feed, trial and churn lists, MRR and "MRP so far", plus a daily digest email. It reads each product's
platform-admin API (`packages/admin-metrics`) with a service credential and stores nothing.

**Zero dependencies** (like the marketing sites): a TypeScript fetch handler (`src/worker.ts`) that
wrangler bundles, and a static SPA in `public/` with no build step. No package.json, so no lockfile
change; wrangler comes from the product apps' dev dependencies.

## Honesty rules

- A product that cannot be read is listed as unreadable and adds nothing to any total.
- A number a product does not measure (`null`) shows as "—" with "not measured", never as 0, and
  totals say which products are missing.
- MRR comes only from prices recorded by Paddle webhooks, per currency, before tax. No FX.
  Subscriptions without a recorded price (paid before this shipped, or discounted) are counted
  separately and not guessed.
- **MRP so far** = MRR − measured costs this month. The only measured cost is LLM spend; hosting,
  Paddle fees etc. are not measured, so MRP is shown only for products that measure their LLM spend
  and is blank for the rest (and in the total, unless every product has it).

## Access (owner only)

1. Put the hostname behind a **Cloudflare Access** application (Zero Trust → Access → Applications,
   self-hosted, policy: your email). Set the GitHub variables `ADMIN_CONSOLE_CF_ACCESS_TEAM_DOMAIN`
   (e.g. `yourteam`) and `ADMIN_CONSOLE_CF_ACCESS_AUD` (the application's AUD tag); neither is secret.
2. The Worker verifies the Access JWT on every `/api/*` call (RS256, issuer, audience, expiry) and
   then requires its email to be in `PLATFORM_ADMIN_EMAILS` — the same list the products use. Without
   the Access settings every API call is refused (fails closed). Access service tokens are refused.

## Configuration (never committed)

Secrets live in **AWS Secrets Manager**, not GitHub; GitHub holds only non-secret variables.
`set-admins.yml` reaches AWS through the GitHub OIDC role in the variable `PAID_APPS_AWS_ROLE_ARN`
(region `AWS_REGION`, default us-east-1), which must be allowed to read and create `paid-apps/*`.

| Name | Where | What |
|---|---|---|
| `ADMIN_CONSOLE_PRODUCTS` | GitHub variable → Worker secret `PRODUCTS` | JSON list, see below |
| `PLATFORM_ADMIN_EMAILS` | `set-admins.yml` input → worker secrets | owner email(s) |
| `ADMIN_SERVICE_TOKEN` | `set-admins.yml` with "rotate" ticked → worker secrets + Secrets Manager `paid-apps/admin-service-token` | shared bearer for every product's admin API |
| `ADMIN_METRICS_TOKEN` | Secrets Manager `paid-apps/admin-metrics-token` (created on first `sync_metrics_token` run) → worker secrets | agents' read-only token |
| `ADMIN_CONSOLE_CF_ACCESS_TEAM_DOMAIN`, `ADMIN_CONSOLE_CF_ACCESS_AUD` | GitHub variables | Access application |
| `ADMIN_CONSOLE_EMAIL_FROM` | GitHub variable | digest sender on an onboarded Cloudflare Email Service domain |
| `ADMIN_CONSOLE_DIGEST` | GitHub variable | `on` to send the daily digest (default off) |
| `ADMIN_CONSOLE_DOMAIN` | GitHub variable | optional custom domain |

`PRODUCTS` (`src/config.ts`): `adminUrl` is the base of each admin API; `tokenEnv` (optional) names
the Worker secret holding that product's token (default `ADMIN_SERVICE_TOKEN`).

```json
[
  {"key": "grants", "name": "Grant Autopilot", "kind": "app", "adminUrl": "https://<grants host>/api/admin"},
  {"key": "payapps", "name": "PayApps", "kind": "app", "adminUrl": "https://<payapps host>/api/admin"},
  {"key": "jobshop-quote", "name": "Job Shop Quote", "kind": "app", "adminUrl": "https://<host>/api/admin"},
  {"key": "seller-books", "name": "Seller Books", "kind": "app", "adminUrl": "https://<host>/api/admin"},
  {"key": "cmmc", "name": "CMMC Workspace", "kind": "app", "adminUrl": "https://<host>/api/admin"},
  {"key": "einvoice", "name": "E-invoice preflight", "kind": "app", "adminUrl": "https://<host>/v1/admin", "tokenEnv": "EINVOICE_ADMIN_TOKEN"},
  {"key": "payapps-site", "name": "PayApps early access", "kind": "early_access", "adminUrl": "https://<host>/payapps/api/admin"},
  {"key": "jobshop-site", "name": "Job shop early access", "kind": "early_access", "adminUrl": "https://<host>/jobshop/api/admin"},
  {"key": "cmmc-site", "name": "CMMC early access", "kind": "early_access", "adminUrl": "https://<host>/cmmc/api/admin"},
  {"key": "einvoice-site", "name": "E-invoice early access", "kind": "early_access", "adminUrl": "https://<host>/api/admin"},
  {"key": "seller-books-site", "name": "Seller Books early access", "kind": "early_access", "adminUrl": "https://<host>/seller-books/api/admin"}
]
```

einvoice-preflight is not a Worker, so `set-admins.yml` cannot reach it: give its host the value of
`paid-apps/admin-service-token` as `ADMIN_SERVICE_TOKEN` (and `paid-apps/admin-metrics-token` as
`ADMIN_METRICS_TOKEN`). With the shared token no `tokenEnv` override is needed; use one
(`EINVOICE_ADMIN_TOKEN` on the console) only if you give einvoice its own token.

## Agent access (read-only metrics)

Agents measure progress with `scripts/metrics.mjs`, which prints one JSON snapshot of every product's
**aggregate** metrics and the cross-product totals (sign-ups, orgs, trials, paid subscriptions, MRR,
cancellations, LLM spend, early-access counts). It uses `ADMIN_METRICS_TOKEN`, a second token that
every product accepts on `GET …/metrics` only: the products refuse it on `/accounts` and on every
other admin route, so it never yields a name or an email. Its reads are audited as `metrics-agent`.

```bash
ADMIN_PRODUCTS="$(cat products.json)" ADMIN_METRICS_TOKEN=… node apps/admin/scripts/metrics.mjs --days 30 [--strict]
```

Setup: run **set-admins** with `sync_metrics_token` ticked. On the first run it creates
`paid-apps/admin-metrics-token` in AWS Secrets Manager and puts it on every worker; agents read the
same secret (e.g. `aws secretsmanager get-secret-value --secret-id paid-apps/admin-metrics-token`)
plus the product list. A product can name another env var with `metricsTokenEnv`. Nothing is
committed or stored in GitHub. `--strict` exits 2 if any product could not be read.

## Token scopes

| Credential | May call |
|---|---|
| verified `PLATFORM_ADMIN_EMAILS` session | everything the product's admin router offers |
| `ADMIN_SERVICE_TOKEN` (console) | GET only: `/metrics`, `/accounts` (and grants' read endpoints) |
| `ADMIN_METRICS_TOKEN` (agents) | `GET /metrics` only |

If a product's `/api/admin` is also behind Cloudflare Access (grants with `CF_ACCESS_*` set), give
its `PRODUCTS` entry `accessClientIdEnv` / `accessClientSecretEnv` naming console secrets that hold
an Access service token; the console then sends `CF-Access-Client-Id` / `CF-Access-Client-Secret`.

## Notifications

- **New paid subscription**: sent by each product's Paddle webhook (not by the console) to
  `PLATFORM_ADMIN_EMAILS`, only when that product has `OWNER_NOTIFICATIONS=on` and its account mail is
  configured. Contents: org, plan, account owner's name and email, recorded monthly price.
  einvoice-preflight has no email port: it only logs.
- **Daily digest** (this Worker's cron, 06:47 UTC): sign-ups, trials started and cancellations in
  the previous UTC day, per product, plus MRR. Off unless `DIGEST_ENABLED=on` and `EMAIL` + `EMAIL_FROM`
  are configured. `GET /api/digest/preview` shows the text without sending.

## API

| | |
|---|---|
| `GET /api/health` | `{ ok, app }`, no auth, no data |
| `GET /api/me` | owner email, configured products, digest state |
| `GET /api/dashboard?days=30` | the dashboard (`src/aggregate.ts`) |
| `GET /api/digest/preview` | `{ subject, text }` of the digest, not sent |

## Commands (from the repo root)

```bash
node --test apps/admin/test/*.test.ts apps/admin/test/*.test.mjs           # gate, aggregation, digest
pnpm exec tsc -p apps/admin/tsconfig.json
pnpm exec biome check apps/admin
cd apps/payapps && pnpm exec wrangler dev --config ../admin/wrangler.jsonc   # local run
```

Deploy: Actions → **admin-deploy** (manual). Then **set-admins** with your email and "rotate service
token" ticked (target `all`) so the console and every product share a fresh token.

## Provenance

Moved on 2026-11-26 from `Duncan-Haywood/private-monorepo` `apps/admin` at commit
`cded6eaf5d8aefcb42e61ed1cad3ec0b81826072` (a copy of the tree, not its git history), when the paid apps moved
to this public repository. Licence: the root `LICENSE` (FSL-1.1-MIT) unless this
directory's own LICENSE says otherwise; third-party files keep their notices. Index:
[`apps/README.md`](../../apps/README.md).
