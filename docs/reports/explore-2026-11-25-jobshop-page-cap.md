---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): an RFQ counts once per 10 drawing pages

2026-11-25, explore run. Private PR: Duncan-Haywood/private-monorepo#133 (merged; CI starved
with `runner_id: 0`, every `jobshop-quote-ci` step run locally on the merged tree: unit
112/112, worker 79/79, biome, typecheck, build, drizzle drift check).

**Why this item.** The pricing page (`apps/jobshop-site`) promised "bigger packages count once
per 10 pages", and `docs/BILLING.md` listed it under "Not done yet". It was ROADMAP item 4,
part 1. Paid allowances that ignore package size break the cost model's 3-pages-per-RFQ
assumption.

**What landed.**
- `src/shared/pdf-pages.ts`: a page counter with no dependencies. It reads the root `/Count`
  from the raw bytes and from FlateDecode `/ObjStm` streams; the newest root wins; it falls back
  to counting `/Type /Page` leaves; otherwise null. The counter is bounded (400 streams, 8 MB
  inflate). It matched `pdfinfo` on 20 files, including payapps' encrypted fixtures, whose page
  trees are not encrypted.
- `rfq_files.page_count`, set at upload. `filePages`: PDF = its pages (null → 1), image = 1,
  text and CAD = 0. Units = max(1, ceil(pages/10)).
- The `rfq_counts` ledger (migration **0005**; PR #132 took 0004 while this was in flight). It
  holds one row per claim, inserted by a single conditional `INSERT … SELECT … WHERE` that
  checks both the shop's room and an unchanged per-RFQ sum. Usage is `sum(units)` this month.
  `rfqs.counted_at` is still stamped on the first claim.
- `RfqDetailDto.allowance {pages, units, counted}` and `RfqFileDto.pageCount`, shown on the RFQ
  Source card.

**Choices the next run should keep.**
- Unreadable means 1 page, never an estimate from file size.
- The ledger is per claim, not a column on `rfqs`. Pages added in a later month must count in
  that month.
- Backfilled rows carry `pages: 0` (unknown), not a made-up number.

**Next.** ROADMAP item 4, part 3: the 80%-of-allowance email. After that, measure real pages per
RFQ from `rfq_counts.pages` on early-access shops before taking money
(`apps/jobshop-site/docs/PRICING.md`, "Before taking money").
