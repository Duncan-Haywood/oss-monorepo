---
kind: milestone
date: 2026-11-27
---
# Seller Books: one ZIP for the tax preparer (2026-11-27)

Bet #5 (`portfolio/monetization/bets.md`). Private-monorepo PR #464; claim
`claim/seller-books/year-end-package-zip`.

## Why this, this run
`roadmap_claim.py --bets` found no free, ungated item on any bet: payapps, jobshop-quote, einvoice-preflight
and cmmc's Next lists were all claimed, or said "if asked", or waited on the owner's deploy. Seller Books
has no ROADMAP. Its ARCHITECTURE "Gaps / next" list had "one zip of every year-end file" marked "if
sellers ask". I took it without that ask, because the timing matters: a Schedule C product gets most of its
sign-ups from January to April. Handing the preparer one file is the moment a seller decides the tool was
worth paying for. Before this, the Schedule C page needed six separate downloads to do it.

## What landed
- `GET /reports/year-end.zip?year=&mileageRate=` puts seven files in one ZIP. Six of them are the existing
  downloads: the Schedule C worksheet, the year's sales ledger, closing inventory, mileage log, expenses, and
  the QuickBooks journal (default account names, no COGS). The worker test checks each one byte for byte
  against its single download.
- The seventh is a `README.txt`. It gives the headline figures (lines 1, 4, 28, 31, 41 and 44a), names each
  file and says which figure it adds up to, repeats the worksheet's warnings and carries the disclaimer.
- `src/worker/lib/zip.ts` is a stored ZIP writer with no dependencies: UTF-8 names, CRC-32, and it refuses
  unsafe or duplicate names. Its CRC is checked against `node:zlib`, and the archives it writes are checked
  with `unzip -t`.
- An "Everything for your preparer (ZIP)" button on the Schedule C page. The seller-books-site copy for the
  Schedule C feature now mentions it.

## Verified
Run locally, because CI was runner-starved (`ci_starvation.py`: 2 of 2 jobs never got a runner):
`pnpm typecheck`, biome, `pnpm test:unit`, `pnpm test:worker` (24 files, 130 tests), `pnpm build`, the site's
`node --test` (56 tests) and `pnpm test:e2e`.

## Next
- A PDF of the worksheet, if sellers ask.
- The site's Full time tier lists "Export for your tax preparer (CSV)". The app does not gate any export by
  plan. The tiers' feature lists should either match the app or the app should gate them. That is a pricing
  decision; this run did not change either side.
