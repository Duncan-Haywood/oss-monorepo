# residential-takeoff: outline-roof sheathing, 2026-11-28

Perf track, first pass on `ventures/residential-takeoff` (bet #6, the paid
Wall Framing Takeoff; no earlier `docs/history/*perf*` names it).

## Reading

- `run_venture_tests.py --times 20` (taken 2026-11-28T03:55Z): the suite at
  61.8 s, sixth of 1,447, and the slowest for-profit suite with no perf pass.
- `suite_file_times.py residential-takeoff`: 46.7 s summed over ~300 files,
  flat; the top file `outlinesheathing.test.mjs` at 5.4 s (21 tests).
- `node --cpu-prof outlinesheathing.test.mjs`, self time summed per function
  (6.09 s sampled): `planeSection` 1,503 ms, `boundedKnapsackMulti` 975 ms,
  garbage collector 548 ms, everything else under 250 ms each.
  `planeSection`'s callers (inclusive): `planeDepth`'s bisection 634 ms, the
  test's `shortCourses` 330, `coursePieces` 319, `bandArea` 256, `runEnds` 196.

`planeSection` is the paid app's own code: every outline (L, T, U) roof the
browser sheathes calls it thousands of times (80 bisection steps per side
for `planeDepth`, then samples per course), so the speed-up is the user's as
well as CI's.

## Change

`outlinesheathing.mjs`, `planeSection`: the per-side clip against the grown
rectangle looped over a fresh array of two four-number tuples for every
side on every call. The two axes are now written out. The arithmetic is the
same operations in the same order; an axis that rules the side out
`continue`s straight away, where the old code set `lo = Infinity, hi =
-Infinity` and fell through to the same `!(hi - lo > TOL)` skip.

## Verification

- Differential check (old file beside the new, exact `JSON.stringify`
  equality): 141,142 `planeSection` calls over 203 outlines (the test's L,
  a rectangle, a T, and 200 seeded random L shapes, every side, depths
  0.5 to 400 in) and 203 whole `sheatheOutlineRoof` results: identical.
- The whole suite passes before and after (numbers below).

## Numbers

| measure | before | after |
|---|---:|---:|
| `planeSection` self time, cpu-prof of `outlinesheathing.test.mjs` | 1,503 ms | 409 ms |
| garbage collector in the same profile | 548 ms | 283 ms |
| `node outlinesheathing.test.mjs`, median of 5 wall | 4.88 s | 4.20 s |
| whole suite, `node --test *.test.mjs`, one run each (1,349 tests, 0 fail both) | 18.6 s | 18.8 s |

The whole suite's wall time does not move: `node --test` runs files in
parallel and ~300 short files bound it, so 0.7 s off one file is inside the
run-to-run noise. The win is CPU per outline roof (3.7x on the function that
was a quarter of the file's samples), which is what a paying user's browser
spends on an L or T house. The suite's CI share is unchanged.

## Not changed, ranked for the next run

1. `boundedKnapsackMulti` (`engine.mjs`, ~900 ms of the file's profile):
   already tuned by earlier passes on the free `wall-framing-takeoff` copy
   (gcd-reduced table, shared keep scratch); the two copies are identical.
2. `planeDepth`'s 80-step bisection: a closed form (the depth where the
   section vanishes is where two sides' grown rectangles meet) would cut
   most `planeSection` calls, but it moves the depths by up to 1e-9 in and
   every downstream course; worth it only with a test that pins the sheet
   counts, not the bytes.
3. `frame(p, j)` is recomputed for every other side on every call; caching
   it per polygon needs the eave line to be immutable, which no caller
   promises today.
4. The suite is ~300 small files at ~0.1 s each: node start-up is most of
   the 47 s, not any one test.
