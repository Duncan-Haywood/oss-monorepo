---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: win/loss counts the routing a line was built from (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #311 (branch
`jobshop-quote/winloss-line-routing`, claim `claim/jobshop-quote/winloss-line-routing`, ROADMAP
item 10, "routing rows from the routing a line was built from").

## Why this item
`roadmap_claim.py --bets` pointed at payapps #5 (Siteline / Trimble Pay portal formats). Neither
has a public import spec, so building one would mean guessing at formats. payapps #9's California
DIR eCPR spec is behind a host the proxy refuses (www.dir.ca.gov, 403). Jobshop-quote #10 was the
one free item that needed no outside source.

## What landed
- `quote_lines.routing_ids` (nullable JSON, migration 0030 from drizzle-kit). Null means no record,
  and the report falls back to `lineUsesRouting` against today's routings.
- `recordRouting` / `sameRoutingRecord` in `src/shared/routings.ts`. The quote page records the
  routing on "Use routing" (replace), "Add after" (append), save-as-routing and update-from-line.
  PATCH `routingIds` is filtered by `shopRoutingIds` (one query scoped by orgId, deduplicated).
- Revisions, the new-quote and hand-line pre-fills (`PrefillCandidate.routingIds`) and
  `copyLineFrom` carry the record.
- `quoteRoutings` returns `{ used, unmatched, deleted }`. `DELETED_ROUTING_KEY` gives "Routing since
  deleted". Routing rows show when the shop has routings *or* any line records one.

## Next (ROADMAP item 10)
Show on the line which routing it is recorded as built from, and let the estimator clear it, if
shops find a tuned line still counted under its routing confusing.

## Verification
typecheck, build and biome are clean. Unit: 499 tests in 36 files. Worker: 225 tests in 36 files.
Private CI was runner-starved (`ci_starvation.py` exit 1), so checks ran locally; e2e results are in
the run record.
