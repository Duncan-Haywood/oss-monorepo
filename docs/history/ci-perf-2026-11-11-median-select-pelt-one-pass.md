# CI perf, 2026-11-11: median by selection, PELT prunes in one pass (changepoint-detector suite 194 s to 175 s)

Perf track. P063 and P064, the two open perf backlog items, both touch
`.github/workflows/` (owner-gated by CODEOWNERS), so this run took item 2 of the
"not changed" list in `ci-perf-2026-11-11-pelt-inner-loop.md`: `median`, which
`robustSd`, `ar1Rho`, `blockVarianceRatio` and the trend fits call on every
PELT pass. The changepoint-detector suite is still the slowest venture suite.

## Profile (before)

The same script as the previous pass (ten `analyze({ trend: 'bends', ar1: true })`
series, n = 240, AR(1) rho 0.5), `node --cpu-prof`, self time summed per
function: about 2.6 s wall, of it `pelt` 1,690 ms, `median` 579 ms, `ar1Rho`
77 ms, `bocpd` 66 ms, GC 49 ms, `makeCost` 31 ms.

## Change (`ventures/changepoint-detector/engine.mjs`)

- `median`: a Hoare quickselect (median-of-three pivot) on a `Float64Array`
  copy instead of a full sort; for an even length the lower middle is the
  maximum of the left part. It returns the value the old numeric sort put in the
  middle, including the sign of a zero (the typed-array sort orders -0 before
  +0; selection does not, so a zero result is resolved by counting the inputs
  that are negative or -0). Any NaN in the input falls back to the old sort.
- `pelt`: pruning is deferred one step and folded into the next step's scan.
  Before, each step walked the live starts twice (score, then compact against
  F(t)); now the step-t scan drops a start whose step-(t - 1) value failed the
  same test against F(t - 1) as it reaches it. Same starts, same order, same
  values, same strict `<` tie-break, so the same changepoints.
- `pelt` with `model: 'mean'` no longer builds `makeCost`'s closure and prefix
  sums it never calls (the loop has its own); the short-series early return
  still uses it.

## Verification

- Same answers: a script imported the old and the new `engine.mjs` side by side.
  20,000 random arrays (length 1 to 60: uniforms, small integers with ties,
  mixes of 0, -0, 1, -1, arrays with NaN, signed zeros only) through both
  `median`s compared with `Object.is`; `robustSd`, `ar1Rho`, `blockVarianceRatio`
  with `Object.is` and `pelt` (6 models x minSegment 1, 2, 5 x penalties bic,
  aic, 25) and `analyze` (8 option sets, as in the previous pass) by
  `JSON.stringify` on 150 random series (n 20 to 320, a third of them counts);
  plus every model on series of length 0 to 11 (the early-return path).
  29,966 cases, 0 differences (252 of them are the same input error both ways).
- The suite: 500 of 500 pass before and after.

## Numbers

Same 4-core container, nothing else running, `node --test '*.test.mjs'` from the
venture directory (what `run_venture_tests.py` runs), bash `time`; "before" ran
on a copy of the venture at `f6f7e4ce`. This container is faster than the one in
the previous note (that note's "after" of 300.7 s reads 194 s here).

| | before | after |
|---|---|---|
| suite wall | 194.2 s | 174.6 s (−10%) |
| suite user CPU | 436.1 s | 390.5 s (−10%) |
| profile script, three runs each | 2.65, 2.61, 2.53 s | 2.17, 2.03, 1.94 s (−22%) |
| `median` self time in the profile | 579 ms | 156 ms |
| `pelt` self time in the profile | 1,690 ms | 1,494 ms |
| `trend bends with sticky noise: --ar1` | 36.5 s | 30.2 s |
| `--ar1 removes the drift warning ...` | 33.3 s | 26.0 s |
| `driftWarning on a same-length null ...` | 26.8 s | 20.7 s |

## Not changed, ranked for the next run

1. `pelt` is now about 75% of the profile, and it is the arithmetic: with few
   true changes almost no start is pruned, so each call is close to O(n^2).
   Fewer calls would beat a faster loop: `trendAdjust`'s `fit` reruns PELT from
   scratch for each of up to ten slope passes and for each candidate knot. A
   warm start, or stopping when the changepoints repeat, changes the iteration
   and needs its own equivalence check.
2. The three AR(1) tests are still the critical path at 21 to 30 s each in a
   175 s suite; the suite is spread over 4 cores, so wall time now tracks the
   sum more than any one test.
3. P063 and P064 remain owner-gated.
