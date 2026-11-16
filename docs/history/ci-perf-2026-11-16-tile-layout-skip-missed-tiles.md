# CI perf, 2026-11-16: tile-layout-planner, skip tiles that miss the floor

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/`, which CODEOWNERS holds for the owner. The top three venture suites
(league, shift-roster, shed) have had a dozen passes each. So this run took the
slowest suite with no perf history at all: tile-layout-planner, 11.2 s in
`platform/ci/venture_suite_times.json` (four suites in parallel, 2026-11-16).

## Reading

Each file alone, `node --test <file>`, on this 4-core container: calc 8.3 s,
page 0.35, deploy 0.15, usage 0.13. In calc, one test took 7.57 s:
"random rooms, tiles, patterns and obstacles always verify". It runs 60
random rooms × 3 modes × 2 (with and without grout). The "best" mode
searches up to 16 × 16 offsets × 2 tile directions through `evaluateLayout`.

CPU profile (`node --cpu-prof`, self time summed per function) for that test:
`evaluateLayout` 3426 ms, `bboxOf` 733, `reuseTiles` 681, GC 623, `clipRect`
489, `polyPerimeter` 309, `clipHalf` 273.

A counting copy run over a wider golden set (below) showed where the loop
went: 236,662 layouts evaluated, **43.4 M tile cells rejected** (wholly off the
floor), 31.1 M full tiles, 15.2 M cut tiles. Nearly half the cells the loop
visited were tiles that missed the floor. On a 45° layout the lattice is
scanned over the bounding square of the turned floor, so about half of it is
outside. Every one of those cells built a 4-corner polygon (a `map` over four
fresh arrays) before its bounding box rejected it.

## Changes (`ventures/tile-layout-planner/calc.mjs`)

1. **Diagonal bounding box from the extreme corners.** The turned tile's box
   is `cx + (u0 − v1)·S45 … cx + (u1 − v0)·S45` (and the same for y). Those are
   the same float expressions the corner list evaluates. Rounding is
   monotonic, so they equal `bboxOf(poly)` exactly. The polygon is now built
   only for a cut tile, or for a full tile when cells are kept for drawing.
2. **Row range on the turned lattice.** For each row, the u-stretch where the
   floor can be is solved from the four reject inequalities. The loop starts
   and stops one pitch beyond it. Skipped cells are more than a whole pitch
   outside, where the exact reject test would drop them anyway. Everything
   inside still runs the exact test. Straight rows wholly above or below the
   floor are skipped with the same two comparisons the per-cell test uses.
3. **Cut-tile pieces.** `bboxOf(p)` was called up to four times per piece per
   obstacle; now once. `polyArea` was computed twice per piece (filter, then
   sum); now once, summed in the same order.
4. **`reuseTiles`.** Leftovers carry their area; the two guillotine splits are
   compared as scalars, not via four fresh arrays and a closure per piece.

## Verification: same answers

- **Golden set:** 136 random valid specs (grid, brick, diagonal; 0 to 2
  obstacles; zero and fractional grout; swap; rotate on/off). For each, all
  7 `planMode` modes with `keep = true` (every outline) plus
  `compareLayouts` were serialized with `JSON.stringify` and hashed. Old
  code: `9d363d6f…72f88a`. New code: the same hash.
- **Pinned test** added to `calc.test.mjs`: "layouts are byte-identical to
  the pinned output". It covers 4 specs × 4 modes, including diagonal with an
  obstacle, a wall gap and fractional grout. The hash was taken from the old
  code, and the test passes on both the old and new `calc.mjs`.
- `python3 platform/ci/run_venture_tests.py tile-layout-planner`: ok, 45
  tests.

## Numbers

| measure | before | after |
|---|---:|---:|
| golden set, wall (2 runs each) | 21.5, 23.0 s | 15.0, 15.4 s |
| `node --test calc.test.mjs` (3 runs each) | 7.5, 8.1, 8.5 s | 4.9, 4.7, 4.5 s |

About 31% off the golden set and 42% off the suite's slow file. The live page
runs the same search in the visitor's browser, so "best layout" answers
arrive sooner there too.

## Not changed (ranked, for the next run)

1. **Cut-tile clipping** (`clipRect`/`clipHalf`, about 2.6 s of the profiled
   15 s). A straight tile that crosses only the wall could be intersected as
   a rectangle directly. But Sutherland–Hodgman interpolates the crossing
   point, and the result can differ from the wall coordinate in the last bit.
   That would change `visible` and `wastePct` by ulps, so it is not
   byte-identical. It is worth doing only alongside a deliberate re-pin.
2. **`evaluateLayout` self time on full tiles** (31 M). Counting each row's
   interior run arithmetically would change the order in which `visible`
   adds up. Keeping a plain `visible += tileArea` loop for the run would
   still save the obstacle tests.
3. **`reuseTiles` pool scan** (linear over up to 2000 leftovers per piece).
   A sorted-by-area structure would cut it, but tie order must match the
   current first-smallest rule.
4. youth-lineup-rotator (calc.test 7.4 s) and tile-layout-optimizer (calc.test
   5.1 s) have no perf history either.
