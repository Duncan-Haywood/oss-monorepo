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

## Phase 1

- Indoor door camera → aggregate counts (no identity)
- POS ingest → normalized `SaleEvent`
- Join for looked-at vs sold insights

## License

Private repository — all rights reserved unless otherwise agreed with store operators.
