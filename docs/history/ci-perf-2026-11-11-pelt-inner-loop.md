# CI perf, 2026-11-11: PELT's inner loop, changepoint-detector suite 599 s to 301 s

Perf track. Both open backlog perf items (P063, P064) touch `.github/workflows/`,
which CODEOWNERS holds for the owner, so this run took "the slowest local step an
agent session waits on": the changepoint-detector suite, the slowest venture suite
(`run_venture_tests.py` sets its 20-minute per-suite cap because of it) and the
third most-touched venture this week (533 file changes since 2026-11-04).

## Profile

The previous pass (`ci-perf-2026-11-10-laplace-cost-sorted-runs.md`) named the
`--ar1` trend-bend test as the new critical path. Ten of its series
(`analyze({ trend: 'bends', ar1: true })`, n = 240, AR(1) rho 0.5) under
`node --cpu-prof`, self time summed per function: 12.1 s in all, of it

| function | self time |
|---|---|
| `pelt` (with the `mean` cost inlined into it) | 6.9 s |
| `median` (two entries: the function and its comparator) | 3.1 s |
| `segment` (trendAdjust's PELT wrapper) | 0.7 s |
| garbage collector | 0.6 s |

`trendAdjust` runs PELT up to ten times per candidate knot, and every candidate
knot of every greedy round, so PELT is called tens of thousands of times on
short series. Per step `t` the old loop allocated a `vals` array of numbers and
`null`s, a `next` array and a `forEach` closure, and called the cost through a
closure whose shape differs by model (megamorphic across the suite). `median`
copied its input to an array and sorted with a comparator.

## Change (`ventures/changepoint-detector/engine.mjs`)

- `pelt`: candidate starts and their values in two preallocated typed arrays,
  compacted in place; a start too recent to score is marked `-Infinity`
  (kept by the prune test, as `null` was; a NaN cost is still pruned). For
  `model: 'mean'` the cost is written inline, the same expression in the same
  order as `makeCost`'s; other models still call `makeCost`'s closure.
- `median`: `Float64Array.from(a).sort()` (numeric) instead of
  `[...a].sort((x, y) => x - y)`. Same order except that -0 and +0 may swap,
  which leaves the median's value unchanged.

## Verification

- Same answers: a script imported the old and the new `engine.mjs` side by side
  and compared `JSON.stringify` of the results: `pelt` on 150 random series
  (n 20 to 320) x 6 models (`mean`, `meanvar`, `meanvarlaplace`, `poisson`,
  `negbin`, `ar1mean`) x minSegment 1, 2, 5 x three penalties, and `analyze` on
  the same series with eight option sets (`trend: 'bends', ar1`, `trend: 'line'`,
  `period: 12`, `bend: 2`, `robust`, `meanvar`, `poisson`, default).
  9,300 cases, 0 differences.
- The suite: 481 of 481 pass before and after.

## Numbers

Same 4-core container, nothing else running, `node --test '*.test.mjs'` from the
venture directory (the command `run_venture_tests.py` runs), bash `time`; the
"before" run used a copy of the venture with the old `engine.mjs`.

| | before | after |
|---|---|---|
| suite wall | 598.5 s | 300.7 s (−50%) |
| suite user CPU | 1,119 s | 677 s (−40%) |
| ten `--ar1` bend series (profile script) | 10.2 to 11.4 s | 4.6 to 4.9 s |
| `trend bends with sticky noise: --ar1` | 140.0 s | 56.5 s |
| `--ar1 removes the drift warning ...` | 123.8 s | 56.0 s |
| `driftWarning on a same-length null ...` | 85.1 s | 42.1 s |
| `--joint-knots` least-squares pair | 60.5 s | 23.0 s |

(Per-test times are wall times with test files running concurrently, so they
carry queueing; the suite CPU is the number that counts on a shared runner.)

## Not changed, ranked for the next run

1. `pelt` self time is still 2.8 s of the 4.6 s profile: the arithmetic itself,
   with weak pruning under the 3x penalty passes. Fewer PELT calls would beat a
   faster one: `fit` re-runs PELT from scratch each pass even when the slope
   moved by less than it can change a step; a warm start or an early stop when
   the changepoints repeat would need its own equivalence check (it changes the
   iteration, not just its speed).
2. `median` is 1.0 s: `robustSd` sorts twice per `segment` call. A selection
   (quickselect) would give the same value in O(n); measure first.
3. The three AR(1) tests are now the critical path at 42 to 57 s each.
4. P063 and P064 remain owner-gated.
