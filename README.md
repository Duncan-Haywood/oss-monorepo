# Retail Pilot Intel

Privacy-first retail analytics for small-format pilot stores (initial target: ~10 m² leather boutique, Italy).

**Stack:** TypeScript monorepo (pnpm), TSX documentation site, Node 22+ with built-in SQLite.

## Documentation (TSX)

```bash
pnpm install
pnpm docs:sync     # compile docs/*.html, reports/*.html, docs/*.md → apps/docs
pnpm docs:dev      # http://localhost:5173 — private docs (passcode: atelier-docs)
pnpm docs:build    # → apps/docs/dist
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

Built docs are verified in CI and uploaded as a GitHub Actions artifact.

## Quick start

```bash
pnpm install
pnpm bootstrap     # sample edge + POS events → SQLite + report
pnpm run ci        # typecheck, lint, build, bootstrap smoke test
```

## Repository layout

```
apps/docs/              TSX documentation site (Vite/React)
apps/portal/            Secure sales demo portal (illustrative data)
packages/schemas/       Event types + JSON Schema
packages/edge/          On-device vision (stub CLI)
packages/pos/           POS connector (stub CLI)
packages/analytics/     SQLite rollups & reports
scripts/ci.ts           TypeScript CI orchestrator
.github/workflows/      GitHub Actions
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

Private repository — all rights reserved unless otherwise agreed with store operators.
