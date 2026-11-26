---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: the line shows, and can clear, its recorded routing (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #314 (merged), claim
`claim/jobshop-quote/winloss-line-routing-shown-and-cleared` (ROADMAP item 10, the "Next" left by
`ventures-2026-11-26-jobshop-winloss-line-routing.md`).

## Why this item
`roadmap_claim.py --bets` pointed at payapps #5 (Siteline / Trimble Pay formats: no public import
spec, so building one would mean guessing, the same reason the last run gave) and payapps #10
(waiver history outside a pay app, which does not exist yet). Jobshop-quote #10's next slice
needed no outside source.

## What landed
- `recordedRoutings(ids, routings)` and `withoutRouting(ids, id)` in `src/shared/routings.ts`.
  Removing the last routing leaves `[]`, not `null`: an empty record counts under "No saved
  routing" in `quoteRoutings` and is never re-matched by operations. `null` stays `null`.
- `RoutingRecord` in `src/client/routes/quote-detail.tsx`, under "Routing templates": names
  (with part family), "Routing since deleted", "×" per routing, "Clear" when more than one. Saved
  by the line's Save (the existing `routingsDirty` path already sends `[]`). Read-only when not
  editable. The routings query now also runs on read-only lines that hold a record.
- No API or schema change: `PATCH .../lines/:lineId` already accepted `routingIds: []`.

## Verification
Typecheck and biome clean. `src/shared/routings.test.ts` 20/20. `test/worker/win-loss.test.ts`
6/6 (now clears a line, loses it, expects `["No saved routing", 0, 1]`). New
`test/e2e/10-routing-record.spec.ts` passes. The full workflow run is in the run record.
