---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): win/loss by routing and part family

2026-11-25, explore run. Private PR: Duncan-Haywood/private-monorepo#190.

**Why this item.** Explore-track run; the free choice went to bet #2. Item 9 (material family in
routing suggestions) was claimed by another run 0 minutes before this run's claim
(`routings-part-4-material-family`), so it took item 10's open part instead:
`roadmap_claim.py jobshop-quote --claim 10 --slug win-loss-part-3-by-routing`.

**What landed.** `quoteRoutings` and `byRouting`/`byPartFamily` in `src/shared/win-loss.ts`,
routings loaded per org in `services/quotes/analytics.ts`, two cards on the Win/loss page, and a
"Routings" column at the end of the CSV. No migration, no new endpoint.

**Choices the next run should keep.**

- Matching reuses `lineUsesRouting` from `routing-suggest.ts` (contiguous, in order, machine + label
  only), so "used this routing" means the same thing in the suggestions and in the report.
- Lines do not store which routing they came from; the report matches against the saved routings
  *as they are today*. If lines ever record a `routingId`, prefer it (ROADMAP item 10, part 4).
- "No saved routing" counts a quote when any of its lines with operations matched no routing; lines
  with no operations are neither.
- Part families group by trimmed, lower-cased, space-collapsed text; routings with no family add no
  row. Both cards are hidden when empty.
- `winLossReport`/`winLossCsv` take routings as an optional second argument (default `[]`), so the
  existing callers and tests needed no change beyond the CSV's extra trailing column.
