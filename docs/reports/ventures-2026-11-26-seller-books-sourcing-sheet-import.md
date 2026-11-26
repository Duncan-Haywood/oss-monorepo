---
kind: milestone
date: 2026-11-26
---
# Seller Books: import the sourcing sheet sellers already keep (2026-11-26)

Bet #5 (`portfolio/monetization/bets.md`). Private-monorepo PR #238, merged; claim
`claim/seller-books/inventory-csv-import`.

## Why this, this run
payapps (bet #1) had a claim on a new item about every 30 minutes on 2026-11-26. Most of its free
ROADMAP items say "if asked", and its launch blockers belong to the owner. `allocate.py` sent this
run to seller-books. Seller Books could import every marketplace report, but inventory went in one
item, or one lot, at a time. A reseller with 300 items in a spreadsheet would stop there, and without
item costs the P&L overstates profit and Schedule C Part III is empty. Flagship milestone 2 said "the
app imports it". It didn't yet.

## What landed
- `services/importers/inventory-sheet.ts` (pure). Reads columns by name with the header list from the
  public `ventures/reseller-books/inventory.mjs`.
  - Required: date bought, a cost (each or for the row), and an item or SKU.
  - Optional: quantity, status, date removed.
  - Quantity N gives N items. A row total is split with the lot rule.
  - A blank, unreadable or negative cost or date skips the row and names its line. A huge quantity is
    skipped too.
  - "Kept" or "donated" needs a date removed, so the right year's Part III counts it.
  - A "date sold" column is ignored, with a warning: sales come from the marketplace reports.
- `services/importers/inventory-store.ts`. A `dryRun` preview. A re-import adds only new items, matched
  on title, SKU, date and cost, counted per key. Orders imported earlier without an item are linked
  by SKU, oldest first, but only to an item bought on or before the sale date.
- The route is `POST /inventory/items/import`. The Inventory page gets a card: preview first, then
  "Import N items".
- The marketing site's cost-of-goods copy now mentions the import.

## Verification
- `run_workflow_locally.py --repo-root <private clone> seller-books-ci`: all 8 `run:` steps passed. The
  3 `uses:` steps did not run.
- 5 new unit tests and 3 new worker tests, including a 403 for a viewer and a cross-org 404.
- seller-books-site: `node --test`, 33/33.
- The card was not driven in a browser. It passed typecheck and Biome only.

## Next
- Carry closing inventory across years explicitly. Last year's line 41 should become this year's line
  35. It is computed from item dates today; check that against a year with write-offs.
- Import the public engine's trip-log CSV into mileage.
- Download one real export per platform before launch (ARCHITECTURE.md, "Gaps / next").
