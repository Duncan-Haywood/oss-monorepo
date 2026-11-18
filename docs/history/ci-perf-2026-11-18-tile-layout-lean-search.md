# Tile layout optimizer: lean layout search (perf, 2026-11-18)

Both perf backlog items (P063, P064) touch workflow files and wait for the
owner. The "Not changed" list in `ci-perf-2026-11-18-pick-path-step-memo.md`
(item 3) named `ventures/tile-layout-optimizer/calc.test.mjs` (5.4 s of 7.5 s
there) as the next concentrated, never-profiled file. No open PR touched it.
The same `planAll` runs in a visitor's browser on every "Optimise" click, so
this is also page latency.

## Reading

4-core container, node 22.

- `node --test --test-reporter=spec calc.test.mjs`: one test, "the sample room
  verifies ... and is repeatable", 3.18 s (four `planAll` calls on the bundled
  sample, metric and imperial); the 40-room random test 0.88 s.
- Scratch benchmark (not committed): four `planAll` calls on the sample,
  digest of `JSON.stringify` of every result. **2938, 3094, 2955 ms.**
- `node --cpu-prof` self time: GC 1233 ms, `packOnce` 1144, `piecesFor` 542,
  `packCuts` 241, everything else under 70.

## What the time was

`optimizeTile` scores every grid start (about 19 x 19 per orientation and
bond) with a quick evaluation, then re-evaluates eight finalists and up to six
alternatives in full. The quick evaluations are thrown away: only their
ranking survives. Each one still built a piece object for every whole tile in
the room, ran a `flatMap` per cut-out for every cell, and packed the cut
pieces with four orderings, where `packOnce` allocated a `[false, true]`
array per free rectangle and a new `best` object per improvement.

## Change (`calc.mjs`)

1. **`packOnce`**: the rotation loop is unrolled into two scalar checks and
   the running best is kept in four scalars. Same score expression, same
   iteration order (bins, free rectangles, upright before rotated), same
   strict `<`, so the same choice.
2. **`piecesFor`**: a cut-out that misses every rectangle of the cell is
   skipped before the `flatMap`. `subtract` returns `[r]` (the same object)
   for a miss, so the result is the same array content.
3. **Lean quick evaluations**: `evaluate(..., lean = true)` counts whole
   tiles instead of building their piece objects, and adds their area as
   `fullCount * tw * th`. Areas are integer hundredths of a millimetre
   squared, so the sum is exact in any order. Only the layout search's
   ranking passes use it; every plan `optimizeTile` returns is re-evaluated
   in full from its layout, as before.

## Verification

- Equivalence script (scratch): the original `calc.mjs` and the new one on
  202 problems (the two samples plus 200 random rooms, 0 to 3 cut-outs, two
  tile options, random grout, gap, kerf, narrowest cut, bonds, rotation,
  offcut rotation and reuse), `JSON.stringify` of every `planAll` result
  including bins' free lists: **0 differing, digests equal**
  (`4aef0c38a63f0fbc`). Time over the set: 14.4 s old, 8.0 s new.
- Sample benchmark digest unchanged (`da86bf6d8659267b`).
- `node --test '*.test.mjs'` in the venture: 40 pass, 0 fail.

## After

- Sample benchmark (four `planAll` calls): **2068, 1894, 1856 ms** (from
  ~3000), so one "Optimise" click on the sample goes from ~740 ms to ~470 ms.
- `calc.test.mjs` wall clock, alternated with the old file stashed:
  before 3929, 4094 ms; after 2835, 2678 ms.

## Not changed, ranked for the next run

1. **GC is still the largest single line** (~670 ms of the benchmark):
   `cellsFor` allocates every cell rectangle and `intersect` a clipped copy.
   A lean path could count interior cells (inside `R`, no cut-out hit)
   without allocating either; exact, but it duplicates the cell walk.
2. **`packCuts` self time (~250 ms)**: `[...cuts].sort(cmp)` four times per
   quick evaluation. Pre-sorting the cuts once per ordering is exact only if
   the sort is stable on ties (it is in V8), so it is cheap to try.
3. Other untouched suites from today's lists: event-seating-chart-optimizer
   `calc.test.mjs` 2.9 s, demand-charge-interval-analyzer `tou.test.mjs`
   2.5 s; neither profiled.
4. P063 and P064 remain owner-gated (workflow files).
