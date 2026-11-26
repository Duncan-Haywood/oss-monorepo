---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: removal rates and drill feeds from a spreadsheet (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #196, merged.

## What landed
- `apps/jobshop-quote/src/shared/material-rate-import.ts`: one module for both per-material
  tables (`removal-rates`, `drill-feeds`), the same read → plan → export shape as
  `cut-speed-import.ts`. If a third machine × material table appears (tap time per size, peck
  time), add a `SPECS` entry there rather than copying the module again.
- `POST /rate-card/{removal-rates,drill-feeds}/import`, `materialRateImportSchema` in `api.ts`,
  `importMaterialRates` in `services/ratecard`.
- Two new sheet kinds in `client/routes/rate-card-import.tsx` (`isPairSheet` routes them to
  `/rate-card/<kind>/import`).

## Decisions
- Feed per revolution / per tooth is refused, not converted: it needs an rpm the app never assumes.
- Header "Material removal rate" is the value column (the material regex excludes removal/rate/feed).
- The export's last column is the machine default, labelled "(not imported)"; the reader refuses
  any "default" header so the round trip is a no-op. No commas in that header: unquoted pastes
  would split it.

## Verification
typecheck, biome, unit 353 passed (15 new), worker 193 passed (5 new), build, e2e 3/3 locally.
GitHub runners starved (`ci_starvation.py --run 45725963787 --repo Duncan-Haywood/private-monorepo`:
2 of 2 jobs never got a runner).

## Next on this item
Drill feed split by diameter if one feed per material proves coarse; peck time; tap time per size.
