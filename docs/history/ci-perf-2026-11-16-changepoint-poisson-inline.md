# changepoint-detector: PELT scores the Poisson cost inline (2026-11-16)

**Where it came from.** The 2026-11-16 stale-LR note ranked changepoint-detector's
per-file times first for the next run (engine.test.mjs 33.8 s). A spec-reporter run
of `engine.test.mjs` here put one test at 44% of the file: "count trend bends"
(16.1 s of 36.6 s). It runs 40 seeded 240-point Poisson series through
`analyze` with `trend: 'bend'` and twice with `trend: 'bends'` (120 analyses).

## Profile

`node --cpu-prof` of the test's loop (10 seeds, a standalone copy of the test's
inputs), self time:

| function | ms |
|---|---|
| the Poisson cost closure (makeCost, `engine.mjs` poisson branch) | 1249 |
| `pelt` | 1230 |
| `fit` (poissonTrend's Newton step) | 208 |
| `median` (almost all from `robustSd`) | 133 |
| `robustSd` | 53 |

Counted, not sampled: 11,699 PELT calls for 30 analyses (about 390 per
analysis), 135 million cost evaluations, about 11,500 per call on n = 240. So
each evaluation is about 18 ns, a `Math.log` plus a closure call.

## Change (`ventures/changepoint-detector/engine.mjs`, `pelt`)

1. The Poisson cost is written out in PELT's loop, as the `mean` cost already
   was (2026-11-11): the same prefix sums of x and of the exposures, built in the
   same order as `makeCost`'s, the same expression
   `a > 0 && m > 0 ? 2 * (a - a * Math.log(a / m)) : 0`. The short-series
   answer still goes through `makeCost`.
2. `robustSd(x)` (two medians over the series' differences) is no longer
   computed when the model is `poisson`, `negbin` or `negbin1`: none of their
   `makeCost` branches reads `sigma`. A placeholder 1 is passed instead.

## Verification

- **Same answers.** `pelt()` from this branch against `pelt()` from `main`
  (a2add1f2c), `assert.deepEqual` on the whole return value (changepoints,
  cost, penalty): 10,800 cases of 400 random count series (length 2 to 151,
  every seventh all zeros, half with random exposures) x {poisson, negbin,
  negbin1} x minSegment {1, 2, 5} x penalty {bic, aic, 3.5}. All identical.
- The profiled script's sha256 over the JSON of all 30 `analyze` results is the
  same before and after (`aed0b8f8...`).
- Whole suite: `python3 platform/ci/run_venture_tests.py changepoint-detector`,
  768 tests, 0 failed (237 s, measured while another suite shared the 4 cores).

## Numbers (4-core container, quiet, two runs each)

| | before | after |
|---|---|---|
| "count trend bends" test | 16.19 s, 16.00 s | 14.00 s, 13.90 s |
| `engine.test.mjs` file | 36.84 s, 36.33 s | 34.27 s, 33.98 s |

So -13% on the test and about -7% on the file. Other files that run Poisson or
negative-binomial PELT gain too (the `robustSd` skip applies to every count
call); not timed one by one.

## Not changed, ranked for the next run

1. **The cost evaluations themselves.** About 11,500 per PELT call on 240
   points is about 40% of all pairs: K = 0 pruning is weak while the exposures
   are still far from the fitted trend. Cutting them needs a tighter, still
   exact bound or fewer Newton passes, and fewer passes changes the answer.
2. **PELT calls per analysis (about 390).** Each knot on the grid, each fine
   neighbour and each range position runs a full `fit` of up to 12 passes.
   Warm-starting from a neighbour's growth terms would change where Newton
   ends, so it is a product change to measure, not a speed-up.
3. The negative-binomial costs (with exposures, a class-prefix path) still go
   through the closure; inlining them is a larger diff for the NB tests only.
4. P063 and P064 remain owner-gated (workflow files).
