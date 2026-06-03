# Retail Pilot Intel

Privacy-first retail analytics for small-format pilot stores (initial target: ~10 m² leather boutique, Italy).

**Stack:** TypeScript monorepo (pnpm), TSX documentation site, Node 22+ with built-in SQLite.

## Documentation (TSX)

```bash
pnpm install
pnpm docs:dev      # http://localhost:5173
pnpm docs:build    # → apps/docs/dist
pnpm portal:dev    # http://localhost:5174 — sales demo portal
pnpm portal:build  # → apps/portal/dist
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

For the Italy leather boutique pilot, delivery order follows **profit impact**, not sensor count. **Start at ranks 1–3** (door+POS, desirability gap, upsell) — they typically pay back subscription cost with one extra sale/month at pilot AOV.

1. **Door + POS join** — conversion % and revenue per entrant (foundation)
2. **SKU desirability gap** — free cash on slow leather SKUs in ~10 m²
3. **Upsell / basket patterns** — AOV without more footfall
4. **Experiments** — measurable € lift per change
5. **Window / outdoor funnel** — last unless pass-by is proven the bottleneck

Full matrix + monthly € math: `pnpm docs:dev` → **ROI & priorities** (`/roi`).

**Business plan** (market, pricing, GTM, unit economics): `pnpm docs:dev` → **Business plan** (`/business-plan`).

## Phase 1 (technical)

- Indoor door camera → aggregate counts (no identity)
- POS ingest → normalized `SaleEvent`
- Join funnel → conversion and revenue-per-entry KPIs

## License

Private repository — all rights reserved unless otherwise agreed with store operators.
