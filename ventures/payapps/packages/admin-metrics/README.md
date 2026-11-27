# admin-metrics: the platform-admin contract

Shared by every product's `/api/admin/*` and the owner console (`apps/admin`). It has no runtime
dependencies and **no package.json**: apps consume it as source through a path alias
(`@admin-metrics` in each app's `aliases.ts` + `tsconfig.json`), and the zero-dependency apps (the
`.mjs` sites, einvoice-preflight, the console) import `src/index.ts` by relative path (Node ≥ 22.18
strips the types; wrangler/esbuild bundles it). Adding a package.json would need a lockfile change.

| File | What |
|---|---|
| `src/contract.ts` | DTOs: `ProductAdminMetrics` (apps), `EarlyAccessMetrics` (marketing sites), `AdminAccountsPage`, `AdminSignupsPage`. `null` = not measured, never 0. |
| `src/gate.ts` | `PLATFORM_ADMIN_EMAILS` (verified email, case-insensitive), the console's `ADMIN_SERVICE_TOKEN` bearer (GET only) and the agents' `ADMIN_METRICS_TOKEN` (GET `/metrics` only; `adminActorMayAccess`, `canReadAccounts`). Tokens ≥ 32 chars, constant-time. A wrong bearer is a denial even with an admin session. |
| `src/mrr.ts` | MRR from the price each Paddle webhook recorded (`packages/billing` `SubscriptionPrice`): month and year cycles only, per currency, discounted or unpriced subscriptions counted separately and never guessed. |
| `src/activation.ts` | Activation funnel: companies that reached each getting-started step and the required step each stalled on, for all companies and those created in the window. The product passes booleans per step from its own checklist rules (payapps: `ActivationFunnel` on `/metrics`). |
| `src/buckets.ts` | Zero-filled UTC day and ISO-week series. |
| `src/notify.ts` | Owner email text (new paid subscription, daily digest) and the off-by-default switch (`OWNER_NOTIFICATIONS=on` + a real sender + an admin email). Only name, email, org and plan. |

## The API every product serves

`GET /api/admin/metrics?days=30` and `GET /api/admin/accounts?list=recent|trials|churn&limit=50`
(sites: `list=recent` only), behind the gate above, `Cache-Control: no-store`, each read written to the
app's `admin_audit_log` (no org id, so it is never part of a tenant's data). Cross-tenant reads are
metadata only: org name, owner name + email, plan, status, recorded price, lifecycle times. Tenant
content is never selected.

| Product | Admin API base | LLM spend |
|---|---|---|
| apps/grants | `/api/admin` (also its own console at `/admin`) | measured (`llm_calls`) |
| apps/payapps | `/api/admin` | null (no LLM) |
| apps/jobshop-quote | `/api/admin` | measured (`llm_calls`) |
| apps/seller-books | `/api/admin` | null (no LLM) |
| apps/cmmc | `/api/admin` | see `apps/cmmc` |
| apps/einvoice-preflight | `/v1/admin` (also `/api/admin`), service token only | null (cost not recorded) |
| marketing sites | `<site base path>/api/admin`, service token only | — |

## Tests

```bash
node --test packages/admin-metrics/src/*.test.ts
pnpm exec tsc -p packages/admin-metrics/tsconfig.json
```
