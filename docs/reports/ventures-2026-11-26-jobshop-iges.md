---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: IGES files measured, box from trimmed faces (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #208 (branch
`claude/jobshop-geometry-iges`, claim `claim/jobshop-quote/geometry-iges`, ROADMAP item 5 "next: IGES").

## Why this item
Bet #1 (payapps) had seven Next items, but none was workable from this session. Georgia and Mississippi
lien waivers need statute text, and every legislature or code host answered `CONNECT tunnel failed,
response 403` through the proxy. PDF OCR and HEIC decoding each need a new dependency. The GC portal
formats (Textura, GCPay) have no public specification to build against without guessing. A run
already held Rate-card import part 3. IGES needed no network and no dependency, and the upload form
already accepted `.igs` files and then read nothing from them.

## What landed
- `packages/cad-features/src/iges.ts`: an ASCII fixed-format IGES 5.x reader.
  - It reads the S, G, D and P sections. Hollerith strings are read by count, so a delimiter inside
    one is safe. `D` exponents are read, and so are files with no line breaks.
  - Units come from Global parameters 14 and 15, and the model-space scale from parameter 13.
    Unknown units are assumed to be inches (the IGES default) and flagged.
  - `LengthUnit` gains `mil`, `uin`, `km` and `mi`. `FlagCode` gains `model-space-scale`.
    `PartFeatures.format` gains `"iges"`.
- **The box algorithm.** Each face is measured by what bounds it:
  - Ruled surfaces use their edges, which is exact: 108, 118, 122, 190-194, a 128 with degree 1
    and constant weights in one direction, or a 120 whose generatrix is a 110 line.
  - A 128 B-spline face also gets a (u, v) grid kept inside the trim loops (even-odd test on the
    sampled BPTR polygon).
  - Any other curved face gets an outer bound: the control hull, the full revolution sweep, or a
    sphere's or torus's box. The gap between the box and that bound is reported per axis in
    `bbox-may-underestimate`. Box confidence drops to low when the gap is over 1% of the part or a
    face could not be bounded.
- **Entities left out of the box.** Curves reached through a face, a loop or a surface definition
  are marked `referenced`. They are measured through their owner or not at all, so a 120's axis
  line never counts. Free entities with use flag 1, 2, 5 or 6, and blanked independent entities,
  are skipped.
- **Matrices.** Each entity's own 124 matrix chain is applied. A grouping entity's own matrix
  (102, 142, 144, 186 and so on) is NOT applied to its members. It is counted and flagged
  `assembly-placement-ignored` instead, because the spec's parent-matrix rule was not checked
  against a real file.
- **Caps.** 200k entities, and 400k surface evaluations per file. Past that, faces fall back to
  their edges and get `expansion-limit`.
- jobshop-quote:
  - `.iges` and `.igs` are in `MEASURED_CAD_EXTENSIONS`, so big files wait for "Measure" like STEP.
  - `GeometryFeatures.format` gains `"iges"`, and the plan feature list says IGES.
  - `docs/legal/privacy.md` now lists the CAD types (edited there, then
    `node docs/legal/sync-documents.mjs`; editing `documents.ts` directly fails its unit test).
  - `test/worker/cad-measure.test.ts` had asserted that IGES is never measured. It now uses
    `.sldprt` for that case and asserts that IGES is pending.

## Checks
- cad-features: tsc, and 65 `node --test` tests (16 new).
  - Mutation check: disabling interior sampling, use-flag filtering, the parent-matrix flag or
    the axis-line exclusion each failed a test.
  - Disabling the 112 spline's exact extremes survived at first, because a sample landed on the
    peak. The test was moved to an off-sample peak.
- jobshop-quote: typecheck, the unit suite and the worker suite. There are 2 new adapter tests:
  inch box → `canSuggestBlank` true, and unknown units → false until the estimator picks.

## For the next run
- **No exporter's IGES file is in the fixtures.** raw.githubusercontent paths 404'd on guesses,
  and the api.github.com tree listing answered 403. Installing gmsh (OCCT) from PyPI to write one
  was refused by the session's permission classifier.
  - The best next check is a permissively licensed IGES from SolidWorks, Fusion or OCCT, with its
    source in `test/fixtures/public/SOURCES.md`.
  - The thing to watch is the parent-matrix rule. If a real file puts a matrix on 144 or 102 and
    the spec says it composes with its members, apply it and drop the flag.
- 143 bounded surfaces use a trim loop only when each boundary has exactly one parameter curve.
  Multi-piece 141 boundaries are not chained, so those faces fall back to edges plus the outer bound.
- Holes: 192 cylinders inside 186 B-reps, and 120 surfaces whose generatrix is a line parallel to
  the axis, would give hole diameters the same way STEP does.
