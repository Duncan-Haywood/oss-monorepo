# Stock size from a STEP or STL file: mesh vertices read once (2026-11-26)

Perf track, `machine-shop-guides` (front door to bets #2 job-shop quoting and
#4 CMMC; `portfolio/monetization/bets.md`). No earlier page-perf pass existed
for this venture.

## Reading

- Weight is not the lever: `module-exclusive.mjs` gives 1–37 kB gz per page
  (`drawing-review.html` 37 kB, `stock-size-from-step-file.html` 16 kB).
- Compute is. `readPart` on the fixtures: STEP 1.6–15.6 ms (63 kB file
  slowest), STL 17–19 ms for ~50 kB meshes. A synthetic binary STL of a
  tessellated ellipsoid (300×300 grid, 180,000 triangles, 9.0 MB, about the
  size of an exported production part) took **2,140–2,215 ms**, main thread.
- `node --cpu-prof`, self time: `stlPrimitives` 793 ms, `boxInFrame` 674 ms,
  GC 291 ms. Causes: three `{p, exact}` points per triangle (each vertex of a
  closed mesh appears about six times), and each `boxInFrame` (one per frame
  `orientedBox` tries) and `radialMax` walking all of them; edges counted by
  concatenating two joined-coordinate strings per edge; per-triangle
  `.map` arrays.

## Change

`stlPrimitives` keeps each distinct vertex once (keyed by the same
`${x},${y},${z}` string the edge count already used), counts edges by a
numeric pair of vertex ids, and inlines the volume and normal arithmetic
term for term. The box and round envelope are a min and a max over points,
so multiplicity and order cannot change them.

## Verification

- `readPart` output JSON for all 11 fixtures and the 9 MB mesh: `cmp`
  byte-identical before and after.
- New test in `part-geometry.test.mjs` pins `points.length` to the distinct
  vertex count and checks `boxInFrame` and `roundEnvelopes` against the
  three-points-per-triangle reading in the world and a rotated frame.
- `run_venture_tests.py machine-shop-guides`: 225 tests pass.

## After

9 MB mesh: **809–813 ms** (2.7× faster). Fixture STLs 17–19 ms → 3.4–4.8 ms.
Same method (`bench2.mjs`: one `readPart` call, Node 22, this container).

## Not changed (ranked for the next run)

1. The per-vertex key string (`id`, 239 ms self) is now the top cost. A
   numeric hash on the float bits would need care: `${-0}` is `"0"`, so today
   `-0` and `0` share a vertex, and NaN keys collapse; a bit key splits both
   and could change the "not closed" count.
2. Moving `readPart` to a Web Worker so a large file never freezes the page:
   worth it once meshes past ~20 MB are common.
3. STEP path: 63 kB in 15 ms; no large customer STEP was at hand to profile.
