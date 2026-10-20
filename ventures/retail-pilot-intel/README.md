# Retail Pilot Intel

Privacy-first retail analytics for small-format pilot stores (initial target: ~10 m² leather boutique, Italy).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/retail-pilot-intel/

**Stack:** TypeScript monorepo (pnpm), TSX documentation site, Node 22+ with built-in SQLite.

## Documentation (TSX)

```bash
pnpm install
pnpm docs:dev      # http://localhost:5173 — private docs (passcode: pilot-docs)
pnpm docs:build    # → apps/docs/dist
pnpm docs:export   # build for one-off HTML (see docs/README.md)
pnpm portal:dev    # http://localhost:5174 — sales demo portal (passcode: atelier-demo)
pnpm portal:build  # → apps/portal/dist
```

Deploy the private docs site to Vercel with a custom domain and **Deployment Protection** — see `apps/docs/DEPLOY.md`.

### Sales / marketing demo walkthrough

1. Run `pnpm portal:dev` and open http://localhost:5174
2. Passcode: `atelier-demo` (or set `VITE_DEMO_PASSCODE`)
3. Sign in as **Owner** — Business value is first in the nav; ROI banner on Overview
4. Tour order for stakeholders: **Business value** → **Overview** → **Products** (SKU gap) → **Experiments** → **Trust** (privacy gate)
5. Use the **Presenter guide** at the bottom of each page for talking points
6. Optional live Overview KPIs: `pnpm bootstrap`, then `pnpm exec tsx packages/analytics/src/cli.ts serve-kpis`, then `VITE_PILOT_API_URL=http://127.0.0.1:8787 pnpm portal:dev`. Unset the env var to keep illustrative `demoStore` numbers.

Built docs are verified in CI and uploaded as a GitHub Actions artifact. On push to `main`, they are also published to **private GitHub Pages** when enabled (see [Hosting docs](#hosting-docs-private)). Passcode gate + `noindex` by default.

Long-form commercial viability reports live as native TSX JSX in `apps/docs/src/pages/commercial-viability/`.

## Hosting docs (private)

The TSX docs site is a static Vite build (`apps/docs/dist`) with hash-based routing — no server rewrites required.

Production builds gate the site with a passcode (`VITE_DOCS_PASSCODE`, default `pilot-docs`). Local `pnpm docs:dev` skips the gate unless you set `VITE_DOCS_GATE_ENABLED=true`.

### GitHub Pages (recommended, repo-private)

1. **Settings → Pages → Build and deployment:** set **Source** to **GitHub Actions**.
2. **Settings → Pages → Visibility:** set **Private** (requires GitHub Pro, Team, or Enterprise on the account/org).
3. Set repository secret `DOCS_PASSCODE` (recommended for production builds).
4. Push to `main` — workflow `.github/workflows/deploy-docs.yml` builds and deploys automatically.
5. Open the URL under **Settings → Pages** or the `github-pages` environment on the latest workflow run.

Only people with access to this repository can view private Pages. The client passcode adds a second layer for shared links.

### Vercel (optional — external stakeholders)

Use a separate Vercel project when you need a URL with **Deployment Protection** for people without GitHub access:

1. Import this repo in Vercel; use `vercel.docs.json` (install/build/output).
2. Enable [Deployment Protection → Password](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/password-protection) on the project.
3. Set repository variable `VERCEL_DEPLOY=true` and secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` to enable the optional `deploy-vercel` job in `deploy-docs.yml`.

### Local / LAN preview

```bash
pnpm docs:build
docker compose up docs   # http://localhost:8080
```

More detail: `apps/docs/DEPLOY.md`, `docs/HOSTING.md`, and `docs/README.md`.

## Quick start

```bash
pnpm install
pnpm bootstrap     # sample edge + POS events → SQLite + report
pnpm run ci        # typecheck, lint, build, bootstrap smoke test
```

## Repository layout

```
apps/docs/              TSX documentation site (Vite/React)
apps/portal/            Sales demo portal (illustrative data, or live KPIs via VITE_PILOT_API_URL)
packages/schemas/       Event types + JSON Schema
packages/edge/          On-device vision (stub CLI)
packages/pos/           POS connector (stub CLI)
packages/analytics/     SQLite rollups & reports
scripts/ci.ts           TypeScript CI orchestrator
.github/workflows/      CI + deploy-docs (GitHub Pages)
docker/                 nginx config for private docs serve
```

## What to build first (ROI)

For the Italy leather boutique pilot, delivery order follows **profit impact per euro of build**, not sensor count. **Start at ranks 1–3** (door+POS, desirability gap, upsell) — they typically pay back a Core subscription with one extra sale/month at pilot AOV.

1. **Door + POS join** — conversion % and revenue per entrant (ranks 1, 4, 5)
2. **SKU desirability gap + upsell** — margin, cash recovery, and AOV (ranks 2–3)
3. **Experiments** — measurable € lift per change (rank 6)
4. **Window / outdoor funnel** — only after in-store baseline is trusted (rank 8)

Full matrix with scores, monthly € math, and payback: `pnpm docs:dev` → **ROI & priorities** (`/roi`).

**Business plan** (market, pricing, unit economics): `pnpm docs:dev` → **Business plan** (`/business-plan`).

**GTM & target customers** (ICP, personas, digital-first channels): `pnpm docs:dev` → **GTM** (`/gtm`).

**Sales demo** (scripted walkthrough + portal guide): `pnpm docs:dev` → **Sales demo** (`/demo`).

## Phase 1 (technical)

- Indoor door camera → aggregate counts (no identity)
- POS ingest → normalized `SaleEvent`
- Join funnel → conversion and revenue-per-entry KPIs

## License

MIT — see [`LICENSE`](LICENSE).
