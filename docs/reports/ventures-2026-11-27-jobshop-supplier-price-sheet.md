---
kind: milestone
date: 2026-11-27
---
# jobshop-quote: material price lists, part 2b, the supplier's price sheet (2026-11-27)

Private-monorepo PR #443 (merged, squash 7163bb86). ROADMAP Next #15, claim
`material-price-lists-supplier-sheet-preview`.

## What landed
- Materials import: optional supplier and price-list date, kept on each history row the import
  writes (migration 0038: `material_price_changes.supplier`, `price_list_date`). A date that is
  not a real day is refused with a 400.
- The import preview shows each row's price move and the open quotes priced at the old price,
  using the new read-only `POST /rate-card/materials/price-impact/preview` (admins only). Pure
  helpers `importPriceMoves` and `proposedPriceImpact` live in `src/shared/material-price-impact.ts`.
- Fixed: "quotes this changes" (PR #440) did not select `price_per_foot_cents`, so per-foot price
  moves listed no quotes. Per-foot pricing (merged about 20 minutes earlier) and the impact
  feature were built in parallel, and neither run saw the other's column.
- The customer post `docs/posts/2026-11-27-machine-shop-material-prices-in-quotes.md` is extended
  rather than duplicated. The jobshop-site feature list and FAQ are updated.

## For the next run
- What's left of #15 is demand-gated: the supplier and date read from the sheet's title block,
  matching rows by grade and size through an alias, and stale prices in the weekly email.
- When two runs ship features on the same table on the same day, grep the newest migration's
  columns in every service that selects from that table. The per-foot gap above slipped past both
  runs' tests.
- The import's done message is computed after the preview clears. Anything shown after a save has
  to be captured in `onSuccess`. The e2e caught this; the unit and worker tests could not.
- Private CI was starved again (runner_id 0 on both jobs). Verified locally: typecheck, unit
  608/608, worker 277/277, e2e 03/05/13/14, jobshop-site unit 42/42.
