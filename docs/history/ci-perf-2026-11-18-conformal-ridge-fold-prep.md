# Perf, 2026-11-18: conformal-prediction-intervals builds each CV fold once, not once per lambda

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` (owner-gated). The previous run
(`ci-perf-2026-11-18-tournament-pairing-presorted-rows.md`) left a ranked list of
slow suites with no perf pass on record; this run took its first entry,
conformal-prediction-intervals `engine.test.mjs` (`venture_suite_times.json`
records the venture at 6.4 s).

## Reading

- `node --test --test-reporter=spec engine.test.mjs`: the four "average coverage
  over 200 seeded repetitions" tests 0.72 to 0.80 s each, the CSV and full
  diabetes `analyze` tests 0.50 and 0.46 s; the other 18 tests under 0.14 s.
- `node --cpu-prof engine.test.mjs`, self time summed per function: `ridgeCV`
  2.19 s (with `ridgeFit`, the scaler and `.map` closures inlined into it),
  `standardize` 0.80 s, `scaler` 0.38 s, `ridgeSolve` 0.18 s, GC 0.16 s.
- Why: `ridgeCV` loops over a 15-value lambda grid and, for each lambda, over
  k folds, calling `ridgeFit` on the fold's training rows. `ridgeFit` rescales
  the rows, standardises every one and accumulates the Gram matrix `Z'Z`,
  none of which depends on lambda. So each fold's scaling and Gram matrix were
  built 15 times for one solve each. `fitConformal` calls `ridgeCV` once
  (split, CQR) or twice (normalized), so every page analysis paid this.

## Change (`ventures/conformal-prediction-intervals/engine.mjs`)

- `ridgeSolve` is split into `gramOf` (the same accumulation loop) and
  `solveGram` (copy, add lambda to the diagonal, mirror the upper triangle,
  `solve`). `ridgeSolve` is the composition, so its callers are unchanged.
- `ridgePrepare(X, y)` does the lambda-free part of `ridgeFit` (scaler,
  standardised rows, centred target, Gram matrix) once and returns
  `fit(lambda)`; `ridgeFit` is `ridgePrepare(X, y).fit(lambda)`.
- `ridgeCV` builds each fold's split and `ridgePrepare` once, then loops the
  grid outer and folds inner exactly as before, so `sse` and the
  out-of-fold residuals are summed in the same order.

Same floating-point operations in the same order: the diagonal was always
added after the full accumulation, so caching the accumulated matrix changes
no bit.

## Verification

- Scratch digest (not committed): sha256 of `ridgeCV` (lambda, CV MSE,
  out-of-fold residuals, coefficients, intercept), `ridgeFit`, `ridgeSolve`
  and the intervals of all three `fitConformal` methods on 60 seeded data
  sets (1 to 5 features, some with a constant column, 2 to 7 folds), plus
  `analyze()` on the bundled sample: `9a4b0c86…68b41ecb` before and after.
- New test `ridgeCV matches the pinned digest of twelve seeded fits` pins
  `33e76a98…13c7f875f12c94`, the digest the old code produces.
- `node --test *.test.mjs` in the venture: 46 tests pass (47 with the new one).

## Numbers

| measure | before | after |
|---|---:|---:|
| `node --test engine.test.mjs`, 3 runs (wall, `date` stamps) | 4.56 / 4.77 / 4.56 s (24 tests) | 1.53 / 1.43 / 1.44 s (25 tests) |
| `analyze({csv: diabetes})`, 442 rows, mean of 10 warm calls | 462 ms | 89 ms |
| `analyze({csv: diabetes, repeats: 50})`, one cold call | 1147 ms | 379 ms |

The page runs `analyze` on the main thread on every "Run" click, so the last
two rows are what a visitor feels.

## Not changed, ranked for the next run

1. **The coverage tests' own loops** (4 x 200 reps x 3 methods) are now most of
   the suite's 1.4 s; they are the property under test and stay as they are.
2. **Leave-one-fold-out by downdating** (`G_fold = G_all - G_heldout`) would
   cut the Gram work by about k-fold but changes summation order and so the
   bits; it would need a tolerance comparison, not a digest, for a small gain.
3. Other untouched suites from the previous run's list:
   event-seating-chart-optimizer `calc.test.mjs` 2.9 s,
   demand-charge-interval-analyzer `tou.test.mjs` 2.5 s; neither profiled.
