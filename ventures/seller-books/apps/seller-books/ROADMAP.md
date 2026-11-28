# Seller Books — Roadmap

Status: **live on the Free plan** at https://seller-books.marisstella.app (deploys on every merge,
`../../DEPLOY.md`). Paid plans are dark until the Paddle account is verified. No customers yet. What is
built is listed in [README.md](README.md); how it works in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Added 2026-11-28 so `platform/ci/roadmap_claim.py seller-books` has a Next list to read.

## Done (recent)

- Purchase receipts (2026-11-28, purchase-receipts): receipts on a lot (covering its items) or a loose item, in D1
  with expense receipts' checks and one shared storage allowance (migration 0019); "Receipts for what you paid" on the
  Inventory page counts the year's purchases with and without one and names the costliest without; the year-end ZIP's
  `purchase-receipts/` folder and the shop export list them. The site's cost-of-goods page says what Publication 583
  asks of inventory records.
- Lot cost split by expected price (2026-11-28, lot-cost-by-value): a lot splits its cost evenly or by
  what each item should sell for (`services/books/lots.ts`, migration 0018), matching the
  cost-of-goods guide's worked lot to the cent; even until every shared item has a price.

## Next

- Lot split by value, part 2: read an expected price (or list price) column from the sourcing-sheet import
  (`services/importers/inventory-sheet.ts`) and the lot form's pasted lines from a spreadsheet, if sellers ask
- Lot split by value, part 3: a per-lot note when its split changed after one of its items sold in a year
  the seller has marked filed (`filed-inventory`), if sellers ask
- Purchase receipts, part 2: read a receipt photo's total and date (in the browser) to prefill a new lot, and attach a
  receipt from the sourcing-sheet import's row, if sellers ask
- Paid plans on: once the owner verifies Paddle, set the billing secrets and the site's launch switch
  (docs/BILLING.md) — owner step
