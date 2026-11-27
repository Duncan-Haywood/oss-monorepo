---
kind: milestone
date: 2026-11-27
---
# jobshop-quote: material prices per cwt and per metre kept exactly (2026-11-27)

Private-monorepo PR #446 (merged, squash 8ef0bfdb). ROADMAP Next #15, claim
`material-price-cwt-metre`, part 2c.

## What landed
- Migration 0039: `price_per_cwt_cents` and `price_per_metre_cents` on `materials` and
  `material_price_changes`. A per_lb row keeps $/lb or $/cwt and a per_ft row keeps $/ft or $/m,
  never both. The schema refuses both with a 400.
- `lbPriceCents` / `footPriceCents` / `effectivePrice` in `src/shared/material-price.ts` return
  the exact (possibly fractional) cents, and costing rounds only the line's material total.
  `exactMoneyText` prints up to four decimals ("$4.125"). The basis line reads
  "at $412.50/cwt ($4.125/lb)".
- Two checks of "did the price change": `priceChanged` (which dates the price and writes history)
  also counts a change of unit, while `priceMoved` (Re-price notes and "quotes this changes")
  compares only basis and exact price. That way, re-entering $4.25/lb as $425.00/cwt flags no
  quotes.
- Import: cwt and metre columns are read now (they used to be refused). `keepOneUnit` clears the
  card's other unit when a sheet row gives one. Export and template gain "Price per cwt" and
  "Price per metre" columns, and the workbook derives from the CSV export.
- UI: the Materials form has a "Price per" select, and the table, New price and history use the
  card's unit. jobshop-site FAQ updated. The customer post
  `docs/posts/2026-11-27-machine-shop-material-prices-in-quotes.md` is extended, not duplicated.

## For the next run
- Any new price column has to be added in these places: `priceChangeRow`, the history select,
  the snapshot map in `getRateCardDto`'s rate card, `priceFieldsOf`, `definedPrice`,
  `price-impact.ts`'s select, `priceOnly`, `importPriceMoves`, and the client preview body. Grep
  `pricePerMetreCents` to find them all.
- What's left of #15 is demand-gated: editing a per-foot row's cut allowance, bar length and
  remnant in place; several bar lengths per material; a supplier's PDF price list.
- Private CI was starved again (runner_id 0). Verified locally: typecheck, unit 623/623, worker
  280/280, e2e 01/13/14/15, build, `drizzle-kit check`, jobshop-site unit 42/42.
