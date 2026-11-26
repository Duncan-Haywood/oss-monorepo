# Seller Books

Profit and Schedule C books for resellers on eBay, Poshmark, Mercari, Whatnot, Depop and Etsy. You import the
marketplaces' own reports, track cost of goods per item and per lot, and log mileage. The app then shows
profit by platform and month and builds a Schedule C **worksheet** (not a filing, not tax advice).

Read `docs/ARCHITECTURE.md` first. `docs/IMPORTERS.md` lists every supported report and how well its columns are
verified.

```bash
pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
```

```bash
echo "AUTH_SECRET=$(openssl rand -hex 32)" > .dev.vars
pnpm db:migrate:local
pnpm dev   # http://localhost:5173
```

Status: v0.1, not deployed; the by-hand deploy workflow is in [docs/DEPLOY.md](docs/DEPLOY.md). Paid plans are built and dark until the owner sets the Paddle secrets
([docs/BILLING.md](docs/BILLING.md)). Account email (verification, password reset) and its setup: [docs/EMAIL.md](docs/EMAIL.md). See "Gaps / next" in the architecture doc before launch.
