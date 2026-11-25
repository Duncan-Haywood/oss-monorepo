---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): large CAD files are measured on request, not in the upload

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#169 (merged). Claim slug
`geometry-hardening-size-threshold` (ROADMAP item 5, "Hardening").

**Why this item.** Bet #1 (payapps) Next items were claimed, conditional ("once a customer asks")
or need a format this session could not verify (Procore's support site does not resolve through
the proxy, so a "Procore invoicing CSV" would have been guessed). I claimed bet #2 item 9
`repeat-parts-part-3-hand-lines`, but another run had claimed the same part about a minute earlier
(`repeat-parts-part-3-manual-lines`), so I dropped it. The release push (`--release`, and a plain
`git push --delete`) was cut off by the proxy, so the stale claim branch stays until it ages out
after 6 h.

**What landed.**
- `INLINE_GEOMETRY_MAX_BYTES` (1 MB) in `services/rfq`. STEP/DXF files above it skip
  `ctx.geometry.extract` at upload. `geometryPending(f)` is derived (measured extension, over the
  limit, no geometry, no `conversionError`), so there is no migration.
- `measureFile` + `POST /rfqs/:id/files/:fileId/measure` (estimators only). It reads R2 and
  extracts. On success it links the RFQ's unlinked parts by `geometryFileFor`, which is now
  shared with `extractRfq`. On nothing it stores `MEASURE_FAILED` in `conversionError`.
- A Measure button on the RFQ Source card. `test/worker/cad-measure.test.ts` has 4 tests.

**For the next run.** The 1 MB figure is a linear estimate from 76 ms for a 166 KB STEP. Timing
a real 10–15 MB STEP in workerd would replace it with a measurement. A queue consumer is the
next step if shops find the click a chore. A quote that already exists is not updated when a
file is measured later.
