# Stock size from a STEP or STL file: STL meshes weld by float bits, not strings (2026-11-26)

**Merged on top of a parallel pass.** While this PR was in CI, another perf run
landed `stock-size-page-perf-2026-11-26-stl-vertices-once.md`: distinct
vertices kept once, but still keyed by a `${x},${y},${z}` string, and edges in
a numeric `Map`. Its "not changed" item 1 was this change (a float-bit key
that keeps `0 == -0` and NaN collapsing). The merge keeps that run's inlined
volume and normal arithmetic and its first-occurrence points, and swaps in
`weldVertices` plus sorted edge keys. Against main after that run (same bench,
same container): **80k 276 → 146 ms, 500k 1,700 → 647 ms, 2M 8,518 →
3,250 ms**; `readPart` and `stlPrimitives` output, `points` included,
identical to main's on the 6,798-case comparison below. From the original
code: 500k 5,445 → 647 ms (8.4×). The sections below describe this PR's first
version, before the merge; the points list now has one entry per welded
vertex (main's rule) instead of keeping `-0` spellings separately.

Perf track, version 0, item 4 ("what visitors wait on"). The perf backlog had
no agent-workable item (P063, P064, P086 are owner rows). Target:
`ventures/machine-shop-guides/stock-size-from-step-file.html`, a free front
door to bet #2 (AI RFQ-to-quote for job shops, `portfolio/monetization/bets.md`).
Its reader, `part-geometry.mjs`, is the same code the paid Job Shop Quote
gained STL support from (private PR 206).

## Reading (before, `0e62156e4`)

Page weight is not the lever: `module-exclusive.mjs` gives the page 16 kB gz
of modules. The wait is compute: `readPart` runs on the main thread when a
shop drops a file, and an STL exported from CAD at fine tolerance or from a
scan is easily hundreds of thousands of triangles (a 500k-triangle binary STL
is 25 MB).

Benchmark: a closed torus mesh, binary STL, `2·N·N` triangles, `readPart`
timed with `performance.now()` in Node 22 on this container (one run each;
the script is reproduced below).

| triangles | before | after |
|---|---|---|
| 80,000 | 708 ms | 209 ms |
| 500,000 | 5,445 ms | 1,110 ms |
| 2,000,000 | 23,172 ms | 4,945 ms |

Phases at 500k triangles, before: parse 32 ms, `stlPrimitives` 3,565 ms,
world box 190 ms, oriented box 1,442 ms, round envelopes 362 ms. Inside
`stlPrimitives` the time was building a `"${x},${y},${z}"` string for every
corner (1.5M) and a `"a|b"` string for every edge side, then a string-keyed
`Map`. The box and envelope searches then walked all 1.5M corners, although
the mesh has only 250k distinct vertices.

## Change

- `weldVertices`: an open-addressing table on the coordinates' float bits
  gives each distinct vertex an id. Equality is the old string rule exactly:
  0 and -0 are one vertex, every NaN is one value.
- Edges are `lo·V + hi` numbers in a `Float64Array`, sorted, and counted in
  runs; an edge whose run is not 2 is open, as before.
- `points` holds each distinct vertex once instead of three corners per
  triangle. A box or envelope is a min or max over points, so the answer is
  the same. Copies of a vertex spelled with a different zero sign are kept as
  their own points (at most 8 per vertex), in first-seen order, so even the
  sign of a zero in `worldBox.min` cannot change.
- Volume, area and plane-normal sums are untouched, in the same order.

After, at 500k: parse 37, `stlPrimitives` 1,017, world box 25, oriented box
80, envelopes 55 ms.

## Verification

- Old and new `readPart`, `stlPrimitives` (all fields but `points`) and 20
  random-frame `boxInFrame` calls compared by a serialiser that tells -0 and
  NaN apart: the three STL fixtures at 1 and 25.4 mm per unit, the 80k and
  500k tori, 300 random triangle soups drawn from {0, -0, 1, -1, 2.5, 1e-3,
  NaN, 3} (duplicates, degenerate and open triangles, NaN), and an ASCII file
  with `-0`: 6,798 comparisons, 0 differences.
- `part-geometry.test.mjs` gains a test: a tetrahedron with some zeros written
  `-0` is still closed, and a 60×60 torus grid welds to 3,600 points, closed,
  with the right box. `run_venture_tests.py machine-shop-guides`: 224 tests
  before, all pass after.

## Not changed, ranked for the next run

1. **Run `readPart` in a Web Worker** on the page. 1.1 s at 500k triangles
   still freezes the tab; a worker keeps the form responsive (needs the
   worker's module graph preloaded, see `revalidate-serve.mjs`).
2. The plane-normal key, `toFixed(4)` three times per triangle (about 100 ms
   at 500k). A rounding replacement must match `toFixed`'s decimal rounding
   exactly, so it needs its own pinning test.
3. Per-triangle `[..].map` allocations for `a`, `b`, `c` (most of the
   remaining `stlPrimitives` self time plus GC).
4. STEP parsing was not profiled on a large assembly; the fixtures are all
   under 64 kB. Get a real large STEP export before optimising.
