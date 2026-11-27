---
kind: milestone
date: 2026-11-27
---
# jobshop-quote: material price lists, part 2a, "quotes this changes" (2026-11-27)

Private-monorepo PR #440 (merged), claim `material-price-quotes-this-changes` on ROADMAP Next #15.

## What landed
- `GET /rate-card/materials/price-impact?minPct=` (any member): open quotes (draft, or sent and
  not yet decided) whose line snapshot prices a material differently from today's card, grouped
  by material, with the move in percent. It reads the newest 2,000 open quotes and says when it
  stops there. Two queries (quotes, then lines joined to quotes on status), so there is no IN list
  and no D1 parameter limit.
- Pure `src/shared/material-price-impact.ts`. A basis change, or a line priced from 0, can't be
  measured as a percentage, so it is always listed. Moves are rounded to 0.1% before the threshold
  test.
- Materials card panel `QuotesThisChanges` with a "Moved by at least" filter. Its query key sits
  under `["rate-card", orgId]`, so every rate-card save refreshes it. It renders nothing when no
  quote is affected.
- jobshop-site: one line in "does the legwork" names the feature.
- The customer post `docs/posts/2026-11-27-machine-shop-material-prices-in-quotes.md` was extended
  rather than a new post written.

## For the next run
- Item 15's remainder is the supplier price-sheet import. `rate-card-import.ts` already matches
  materials by name and lists changed fields. The new part is grade and size matching, a
  supplier/date header, and the old-to-new price per row. The preview can call
  `materialPriceImpact` on the planned prices to name the quotes each change touches.
- Re-price is `POST /quotes/:id/recalculate`; there is no `/reprice` route.
- Private CI was starved again (runner_id 0, 2 s failures). Local typecheck, unit, worker 270/270,
  e2e 13 + 03 and build all passed.
