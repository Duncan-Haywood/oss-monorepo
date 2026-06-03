# Retail Pilot Intel

Privacy-first retail analytics for small-format pilot stores (initial target: ~10 m² leather boutique, Italy).

**Stack:** TypeScript monorepo (pnpm), TSX documentation site, Node 22+ with built-in SQLite.

## Documentation (TSX)

```bash
pnpm install
pnpm docs:dev      # http://localhost:5173
pnpm docs:build    # → apps/docs/dist
```

Built docs are verified in CI and uploaded as a GitHub Actions artifact.

## Quick start

```bash
pnpm install
pnpm bootstrap     # sample edge + POS events → SQLite + report
pnpm run ci        # typecheck, lint, build, bootstrap smoke test
```

## Repository layout

```
apps/docs/              TSX documentation + dashboard (Vite/React)
packages/schemas/       Event types + JSON Schema
packages/edge/          On-device vision (stub CLI)
packages/pos/           POS connector (stub CLI)
packages/analytics/     SQLite rollups & reports
scripts/ci.ts           TypeScript CI orchestrator
.github/workflows/      GitHub Actions
```

## What to build first (ROI)

For the Italy leather boutique pilot, delivery order follows **profit impact**, not sensor count:

1. **Door + POS join** — conversion % and revenue per entrant (foundation)
2. **SKU desirability gap + upsell** — margin and AOV inside the shop
3. **Experiments** — measurable € lift per change
4. **Window / outdoor funnel** — only after in-store baseline is trusted

Full matrix: `pnpm docs:dev` → **ROI** (`/roi`).

**Business plan** (market, pricing, GTM, unit economics): `pnpm docs:dev` → **Business plan** (`/business-plan`).

## Phase 1 (technical)

- Indoor door camera → aggregate counts (no identity)
- POS ingest → normalized `SaleEvent`
- Join funnel → conversion and revenue-per-entry KPIs

## License

Private repository — all rights reserved unless otherwise agreed with store operators.
