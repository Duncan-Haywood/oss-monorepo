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

1. **Door + POS join** — conversion % (highest ROI foundation)
2. **SKU attention + desirability gap** — margin on slow inventory
3. **Window funnel** — entries on high streets (after in-store baseline)

Full matrix: run `pnpm docs:dev` → **ROI** page, or see `apps/docs/src/pages/RoiPage.tsx`.

## Phase 1

- Indoor door camera → aggregate counts (no identity)
- POS ingest → normalized `SaleEvent`
- Join funnel → conversion and revenue-per-entry KPIs

## License

Private repository — all rights reserved unless otherwise agreed with store operators.
