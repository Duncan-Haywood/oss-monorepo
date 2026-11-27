---
kind: milestone
date: 2026-11-27
---
# jobshop-quote: material price lists, part 1 (2026-11-27)

Private-monorepo PR #437 (merged). Bet #2 growth topic "material price lists", which had no claims
before this run (`roadmap_claim.py --bets` named it as untouched).

## What landed
- `materials.price_set_at` and `material_price_changes` (migration 0036). Existing rows are dated
  by `updated_at` and get a `baseline` history row, so no earlier price is invented.
- `shop_settings.material_price_max_age_days`: 90 by default, null is off.
- Rate card: price age, History panel, **New price**. Until now the UI could change a material's
  price only by import; PUT existed, but no form used it.
- Draft quote lines: a "past the limit" note and a "card's price moved since this line was priced"
  note (`src/shared/material-price.ts`, `linePriceNotes`). Neither note re-prices anything.

## For the next run
- Part 2 is ROADMAP Next item 15: a supplier price sheet imported as a price list, "quotes this
  changes", and stale materials in an email if shops ask.
- `drizzle-kit generate` writes `ADD ... NOT NULL` with no default for a `$defaultFn` column.
  SQLite refuses that on a table that already has rows, so give it a DB default by hand (0036
  does).
- Private CI was starved again (runner_id 0). The local equivalents are in the PR's merge message.
