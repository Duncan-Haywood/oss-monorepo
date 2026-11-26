---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: STL meshes, and a units chooser for files that state none (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #206 (merged; branch `claude/jobshop-geometry-stl`)
(claim `claim/jobshop-quote/geometry-stl`, ROADMAP item 5).

## What landed
- `packages/cad-features/src/stl.ts`: binary and ASCII STL. Binary is recognised by size
  (84 + 50n bytes) before any text decoding, because binary headers often start with "solid".
  Corners are welded by exact coordinates. Edges are checked as directed pairs: a closed mesh runs
  every edge once in each direction. Volume is signed tetrahedra about each body's own low corner,
  so float32 parts far from the origin keep their precision. Bodies are connected pieces
  (union-find over shared edges). There is a cap of 500k triangles.
- `PartFeatures.format` gains `"stl"`, and `PartFeatures.mesh` holds `{ triangles, surfaceArea }`.
  `extractFeatures` checks for a binary STL before it decodes anything.
- jobshop-quote: `.stl` is in `MEASURED_CAD_EXTENSIONS`. `GeometryFeatures.units` is
  `{ read: "mm" | "in", setBy: "assumed" | "estimator" }`, set whenever the parser assumed the
  units (every STL, or a DXF with no `$INSUNITS`). `POST /rfqs/:id/files/:fileId/units`
  (estimator role) measures the file again with `assumeUnits`. `toGeometryFeatures(f, source,
  chosenUnits)` then raises units confidence to high and drops the `units-unknown` flag. The RFQ
  page shows a "millimetres / inches" chooser.

## Decisions
- No unit guessing from the part's size. While the units are assumed, every confidence stays
  low, so `canSuggestBlank` and roughing suggest nothing. A person's choice is what unlocks the
  suggestions (the package's anti-guessing rule).
- Mesh confidence is at most "medium" for both box and volume, because facets sit inside curved
  faces. That is enough for `canSuggestBlank` and roughing, which only refuse "low".
- An existing quote is not changed when the units are chosen, the same rule as "Measure".
- Rows stored before this change have no `units` field and get no chooser. Re-uploading the file
  gives them one.

## For the next run
- No public STL fixture yet. A permissively licensed STL (with its source and licence in
  `test/fixtures/public/SOURCES.md`) would add a real-world check.
- Holes from a mesh (cylinder fitting on facet normals) are the next STL step if shops send STL
  for machined parts. IGES is still unread.
- A first `roadmap_claim.py --claim` on payapps item 3 collided with a claim made a minute
  earlier. Releasing it failed: the proxy hung up on branch deletes ("unexpected disconnect while
  reading sideband packet"), so `claim/payapps/sov-pdf-balance-percent-cross-check` is left
  stale. Nothing was built on it, and it goes stale after 6 h.
