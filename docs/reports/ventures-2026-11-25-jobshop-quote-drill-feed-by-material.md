---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): drill feed per material for "Drill from CAD"

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#195. Claim slug
`geometry-drill-feed-by-material` (ROADMAP item 5, "a drill feed chart by material and diameter").

**What landed.** `drill_feeds` (migration 0023: machine × material, unique pair, cascade on
delete), `PUT/DELETE /rate-card/drill-feeds`, `drillFeeds` on `RateCardDto`, a "Drill feeds by
material" card, and `suggestDrillingOperation(holes, machines, alreadySetUp, material, feeds)` in
`src/shared/costing.ts`. Same design as removal rates (PR #192) and cut speeds (PR #176): rows for
the line's material among the active machines win, exactly one must remain; with none, the
machine's default feed applies. Seconds per hole still come from the machine. `isDrillingMachine`
(`src/shared/enums.ts`) decides which machines take a feed: roughing kinds, or any machine with a
seconds per hole or a default feed (a drill press entered as "other").

**Choices the next run should keep.** No assumed feeds. Material split only, not diameter: the
existing doc comment's argument (penetration rate moves less across diameters than across
materials) still holds.

**Next.** Drill feeds (and removal rates) in the rate-card spreadsheet import/export; peck time
for holes over 3×D; split by diameter only if shops ask.

**Verification.** Typecheck and Biome clean; unit tests pass (5 new); worker 28 files / 188 tests
pass, including the new `test/worker/drill-feeds.test.ts` (roles, laser/saw/zero/retired refused,
cross-tenant 404, a STEP quote drilled at the material's feed); build passes. GitHub CI jobs on
the private PR never got a runner (`ci_starvation.py`: 2 of 2 starved), so
`run_workflow_locally.py jobshop-quote-ci` was run here; see the run record.
