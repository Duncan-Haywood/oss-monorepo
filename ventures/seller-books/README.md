# Seller Books: profit and Schedule C books for multi-platform resellers

Bet #5 in [`portfolio/monetization/bets.md`](../../portfolio/monetization/bets.md). Hosted SaaS on
Cloudflare Workers: import the marketplaces' own reports (eBay, Poshmark, Mercari, Whatnot, Depop,
Etsy, Shopify, Amazon, TikTok Shop, Square, PayPal, Venmo, Cash App), track cost of goods per item and per lot, log mileage and
expenses, and get profit by platform and month, a stock report, a Schedule C **worksheet** (not a
filing, not tax advice), quarterly estimates, a 1099-K check and a QuickBooks Online journal export.
Plans: Free (1 platform, 25 orders a month), Side hustle $15, Full time $35, Business $69 a month
(`apps/seller-books/src/shared/plans.ts`), sold through the owner's merchant of record (Paddle), dark
until the owner sets the Paddle keys. Full feature list: [the app's README](apps/seller-books/README.md).

**Source visible, all rights reserved** ([LICENSE](LICENSE)). Publishing this directory grants no
licence to use, host or resell it.

## Why someone would use it

A reseller on two or more marketplaces today either keeps a spreadsheet (four exports, four shapes,
an afternoon a month), uses general bookkeeping (QuickBooks, Wave) that knows nothing about
per-item cost of goods or lots, or pays a reseller tool at about $10–20 a month (Seller Ledger, My
Reseller Genie, Flipwise; third-party prices in
[`apps/seller-books-site/docs/PRICING.md`](apps/seller-books-site/docs/PRICING.md), re-check before
quoting). Seller Books covers more platforms in one shop (including cash and off-platform sales),
follows cost per lot, and hands the preparer one ZIP whose lists each total to the worksheet line
they back. The free front door is [`ventures/reseller-books`](../reseller-books/) (in the browser,
nothing uploaded).

## Layout

A self-contained pnpm workspace, moved here from `private-monorepo` on 2026-11-27 (task
`move-seller-books-public` in [`portfolio/work/tasks.yaml`](../../portfolio/work/tasks.yaml)); the
relative paths inside are the same as there.

| Path | What |
| --- | --- |
| `apps/seller-books` | the app: Hono API + React SPA in one Worker, D1 ([README](apps/seller-books/README.md), [deploy](apps/seller-books/docs/DEPLOY.md), [billing](apps/seller-books/docs/BILLING.md)) |
| `apps/seller-books-site` | the marketing site (plain ESM, no dependencies, `node --test`) |
| `packages/billing` | Paddle billing port, plans, entitlements, the margin-floor check |
| `packages/admin-metrics` | the owner-console metrics contract |
| `scripts/` | the no-source-maps check |

`packages/billing` and `packages/admin-metrics` are also copied in `ventures/payapps` (and in the
other moved products). Each venture keeps its own copy until one shared copy is worth the coupling.

## Run it

```sh
cd ventures/seller-books
pnpm install --frozen-lockfile
cd apps/seller-books
echo "AUTH_SECRET=$(openssl rand -hex 32)" > .dev.vars   # local only, never committed
pnpm db:migrate:local
pnpm dev                              # http://localhost:5173
pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
cd ../seller-books-site && node --test "test/*.test.mjs"
```

CI: [`.github/workflows/seller-books-ci.yml`](../../.github/workflows/seller-books-ci.yml) (read-only, no
secrets). Deploying: [DEPLOY.md](DEPLOY.md).

## Where the work happens

This directory is the only source. Every private-monorepo commit to `apps/seller-books` since 2026-11-25 is in
this copy (checked 2026-11-28 at private `1ee07fc`: each commit's added lines were found here,
apart from doc sentences reworded since), so there is nothing left to bring over. The `sync-from-private.sh` refresh script was deleted on 2026-11-28:
it replaced `apps/` wholesale and would have reverted every change made here since the move. The
private copy is retired (task `retire-private-copies` in
[`portfolio/work/tasks.yaml`](../../portfolio/work/tasks.yaml)); don't edit it.
