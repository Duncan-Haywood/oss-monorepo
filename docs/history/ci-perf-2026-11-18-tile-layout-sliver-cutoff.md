# CI perf, 2026-11-18: tile-layout-planner, stop scoring a layout once it has lost

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` and wait for the owner. This run surveyed the venture suites before
choosing a target.

## Survey (each file alone, `node --test <file>`, 4-core container)

| suite | slowest file | time | outcome |
|---|---|---:|---|
| wall-framing-takeoff | `engine.test.mjs` | 7.7 s | profiled, not changed (below) |
| tile-layout-planner | `calc.test.mjs` | 5.7 s | **changed** |
| demand-charge-interval-analyzer | `tou.test.mjs` | 2.8 s | small LP tests, left |
| einvoice-preflight | `zatca-stamp.test.mjs` | 1.5 s | 238 files, flat, Node start-up bound |
| sales-agent | `page.test.mjs` | 1.5 s | flat |

### wall-framing-takeoff: profiled, not changed

The two sheathing fuzz tests (1.9 s each) spend 3.2 s of 4.4 s in
`exactStock`, the exact-cover DP. 713 calls were harvested from those two tests
and replayed (3.4 s, 836 M state-by-pattern pairs, about 4 ns per pair). The
loop is already tight. The exact search beats the heuristics on 271 of the 553
calls that run it, so it can't be skipped. Its cost also becomes the reported
bound. The obvious algorithmic cut is to try only patterns that hold the
first piece still owed. That gives the same optimum, but the tie-break (lowest
pattern within 1e-12) and the float noise in decimal prices can pick a
different but equally cheap cut plan. That would not be byte-identical, so it
was not done.

## Reading (tile-layout-planner)

The 5.1 s test in `calc.test.mjs` is "random rooms, tiles, patterns and obstacles
always verify". Profile (`node --cpu-prof`, self time): `evaluateLayout`
1.8 s, `reuseTiles` 0.65 s, `clipRect` 0.51 s, GC 0.31 s. Almost all of it is
the search, `searchBest`, which scores up to 16 × 16 offsets × 2 tile
directions.

`betterLayout` ranks by thin cuts (slivers) first. The sliver count only grows
as a layout's tiles are visited. Once a candidate has more slivers than the
best so far, it cannot win, yet each one was scored in full. That meant every
remaining tile, the clipping, and the greedy offcut plan (`reuseTiles`).

## Change

`ventures/tile-layout-planner/calc.mjs`: the body of `evaluateLayout` becomes an
internal `evaluateBounded(spec, lay, keep, maxSlivers)`, and the exported
`evaluateLayout` calls it with `Infinity`, so its behaviour is unchanged.
`searchBest` passes `best.slivers` and drops a `null` result. The cut-off uses
the same test as the final count (`thick < minCut - 1e-6`), so it fires only
when that count would exceed the best's. `tried` still counts every candidate.
`axisCandidates` is now exported for the pin test.

## Verification

- **Byte-identical**: a bench (scratch, not committed) of 150 seeded rooms
  (all three patterns, tiles 100 to 700 mm, minCut 0/50/120, with and without
  obstacles) hashes `planMode(spec, "best", false)`, `planMode(spec, "best",
  true)` and `compareLayouts(spec)`. SHA-256 before and after: `6cce843a…07e7`
  in both.
- **New test** `search-bound.test.mjs` (1.2 s): on 24 seeded rooms,
  `searchBest` deep-equals a plain loop over the same candidates using the
  unbounded `evaluateLayout`, including `tried`. Changing the cut-off to `>=`
  makes it fail, so it reaches the cut-off.
- `python3 platform/ci/run_venture_tests.py tile-layout-planner`: ok, 46 tests.

## Numbers

| measure | before | after |
|---|---:|---:|
| `calc.test.mjs` (`node --test`, 3 runs) | 5.37 / 5.10 / 5.36 s | 3.20 / 3.00 / 3.03 s |
| 150-room bench | 20.9 s | 13.6 s |
| evaluations cut off in the bench | — | 218,826 of 375,340 (58%) |
| `compareLayouts`, 3.47 × 2.81 m, 300 × 600 tile, one obstacle (page click) | 32 ms | 19 ms |
| `compareLayouts`, 5 × 4 m, 100 × 100 tile | 26 ms | 4 ms |

The suite gains a 1.2 s pin test, so the suite's own time drops by about 1 s.
The page (what visitors wait on) gets the full saving on every recompute.

## Not changed, ranked for the next run

1. **A second cut-off at equal slivers.** The next key is `tilesWithReuse`,
   and `full` alone is a lower bound on it (every full tile is bought). A
   candidate whose `full` already exceeds the best's `tilesWithReuse` could
   stop too. Count how often that fires before writing it.
2. wall-framing-takeoff's `exactStock` first-piece restriction (above): worth it
   only with a deliberate re-pin of tied cut plans.
3. The earlier tile notes' clipping and full-tile run items
   (`ci-perf-2026-11-16-tile-layout-skip-missed-tiles.md`) still stand.
4. **changepoint-detector per-file reading** (this run, each file alone, while
   other work ran, so upper bounds): `engine.test.mjs` 40.3 s,
   `engine-trend-bends` 31.0, `engine-trend-joint-knots` 26.1, `synth-cli` 26.1,
   `synth-control` 22.0, `watch-workflow` 21.6, `drift-warning-null195-ar1`
   20.7, `drift-warning-null195` 18.9. Not profiled; `engine.test.mjs` first.
5. P063 and P064 remain owner-gated.
