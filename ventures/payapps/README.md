# PayApps: pay-application billing for specialty subcontractors

Bet #1 in [`portfolio/monetization/bets.md`](../../portfolio/monetization/bets.md): monthly pay
applications (schedule of values, change orders, retainage, an application-and-continuation-sheet PDF
in our own layout), lien waivers, insurance certificates, QuickBooks Online sync, and the job
records around them (daily reports, RFIs, submittals, T&M tickets, job costing, close-out). Hosted
SaaS on Cloudflare Workers, sold by subscription through the owner's merchant of record (Paddle),
dark until the owner sets the Paddle keys. **Not affiliated with the AIA, does not produce AIA
Contract Documents, and not legal advice.**

**Source visible, all rights reserved** ([LICENSE](LICENSE)). Publishing this directory grants no
licence to use, host or resell it.

## Why someone would use it

Today a small sub re-keys an Excel G702/G703 template every month, tracks retainage by hand because
QuickBooks has no native retainage, and chases lien waivers by email. The paid alternatives are
PayAppHub ($39.99–$129.99/mo), Trimble Pay's sub plan ($99/mo), SubLien (from $199/mo) and suites
such as JobTread ($199/mo + $20/user); sources and dates in `bets.md`. PayApps prices by active jobs
($0, $99, $179, $249 a month; `apps/payapps/src/shared/plans.ts`) and covers the pay app, the
waivers, the certificates and the QuickBooks invoice in one place. The free front door is
[`ventures/pay-application-generator`](../pay-application-generator/) (one job, in the browser).

## Layout

A self-contained pnpm workspace, moved here from `private-monorepo` on 2026-11-27 (task
`move-payapps-public` in [`portfolio/work/tasks.yaml`](../../portfolio/work/tasks.yaml)); the
relative paths inside are the same as there.

| Path | What |
| --- | --- |
| `apps/payapps` | the app: Hono API + React SPA in one Worker, D1, R2 ([architecture](apps/payapps/docs/ARCHITECTURE.md), [roadmap](apps/payapps/ROADMAP.md)) |
| `apps/payapps-site` | the marketing site (static pages from TypeScript, `llms.txt`, sitemap, feed) |
| `packages/billing` | Paddle billing port, plans, entitlements, the margin-floor check |
| `packages/lien-waivers` | lien waiver forms with per-state statutory text, checked against official snapshots |
| `packages/qbo-sync` | QuickBooks Online sync port |
| `packages/admin-metrics` | the owner-console metrics contract |
| `scripts/` | the no-source-maps check |
| `docs/legal/OPERATOR.md` | operator and launch authority |

## Run it

```sh
cd ventures/payapps
pnpm install --frozen-lockfile
cd apps/payapps
cp .dev.vars.example .dev.vars        # offline demo: fake billing, no network
pnpm db:migrate:local
pnpm dev                              # http://localhost:5173
pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
```

CI: [`.github/workflows/payapps-ci.yml`](../../.github/workflows/payapps-ci.yml) (read-only, no
secrets). Deploying: [DEPLOY.md](DEPLOY.md).

## Where the work happens

The deploy is ported (`.github/workflows/priv-payapps-deploy.yml`, DEPLOY.md, 2026-11-27), so build
PayApps here. This copy started as a snapshot of private-monorepo commit `03e2e560` (2026-11-26);
[`sync-from-private.sh`](sync-from-private.sh) would overwrite the edits made here since, so do not
refresh from private without carrying them across. Once the public deploy works, the private copy is removed
and this directory becomes the one source.
