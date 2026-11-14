# ad-spend-saturation-optimizer: the curve fit binds its parameters once (2026-11-14)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner. changepoint-detector, the largest suite, has an
open work-in-progress PR (#15962) on its engine, so this run took item 2 of the
previous ad-spend run's "not changed" list
([`ci-perf-2026-11-14-ad-spend-frontier-reachable-range.md`](ci-perf-2026-11-14-ad-spend-frontier-reachable-range.md)):
`cli.test.mjs`, never profiled.

## Profile

`cli.test.mjs` alone: 6.4 s. It runs `analyze` on the sample data about ten
times (three of them in child CLI processes). One `analyze` is 620 ms, and
`node --cpu-prof` on it (self time per function): the Hill curve's `f`
334 ms, the exponential curve's `f` 73 ms, `nelderMead` 56 ms, GC 55 ms,
`sse` 28 ms. So the time is the least-squares objective inside every
Nelder-Mead step of every fit and bootstrap refit.

Hill `f` computed `Math.pow(p[1], p[2])` (k^h) for every data point, although
it only changes with the parameters, and `Math.pow(s, p[2])` twice per point.

## Change

`ventures/ad-spend-saturation-optimizer/calc.mjs`:

- Each curve gains `bind(p)`, which returns `s => f(p, s)` with the
  per-parameter work hoisted: k^h once per parameter set, s^h once per point.
  Same operations in the same order, so the values are the same doubles.
- `fitCurve`'s `sse` binds once per call and loops over two `Float64Array`s
  (the rescaled spends and revenues) instead of an array of objects. The
  summation order is unchanged.

`f` itself is unchanged; everything else (simulation, allocation, back-test)
still calls it.

## Verification

- **Same answers.** A scratch fingerprint hashes `analyze` (full result,
  bootstrap included), `reportCsv` and `budgetLadder` for 5 seeds x 2 lengths
  x 2 margins (one with a skip range), plus `fitCurve` and `fitBest` on
  exponential and Hill fits with a zero and a negative spend added:
  `ce890b96b3ccb457` before and after.
- `node cli.mjs` with `--example --json`, `--example`, `--example --budget
  12000 --json` and `--example --csv`: concatenated sha256 `8f71e487...`
  before and after.
- New test, "curves: bind(p) returns exactly f(p, s)": `Object.is` on 12 spends
  (negative, zero, tiny, huge, `Infinity`, `NaN`) for 7 parameter sets. It
  fails on two mutants (`a * (sh / (kh + sh))`, and the exponential without
  `Math.max(s, 0)`). `s < 0` for `s <= 0` survives, but it is an equivalent
  mutant: at s = 0 both return 0.
- **Timing**, this container (4 cores, node 22):

  | measure | before | after |
  |---|---:|---:|
  | fingerprint script (one process), two runs | 8.04 / 7.91 s | 6.05 / 6.00 s |
  | `run_venture_tests.py ad-spend-saturation-optimizer`, alternating | 10.3 / 9.7 s | 8.5 / 8.7 s |
  | `node --test cli.test.mjs` | 6.4 s | 4.9 s |
  | `node --test calc.test.mjs` | 9.9 s | 8.8 s |

  Fit-heavy work −25%; the suite −14% (10.0 to 8.6 s mean). All calc and CLI
  tests pass.

## Not changed, ranked for the next run

1. **What is left is `Math.pow` and `Math.exp`** (about 3.9 s of the 5.8 s
   profiled fingerprint). Taking `log s` once per point and using `exp(h·log s)`
   would be faster but not bit-identical. Fewer Nelder-Mead iterations or
   bootstrap refits would change answers: product decisions.
2. **`nelderMead`'s bookkeeping** (0.9 s self plus 0.3 s GC): it sorts an
   index array and rebuilds `pts`/`vals` with `map` every iteration, and `at`
   allocates. An in-place version with the same stable order is exact but
   worth perhaps 15% of the remainder.
3. The frontier test in `calc.test.mjs` is still about 6 s (previous run's
   item 1, a test-input judgement).
4. P063 and P064 remain owner-gated (workflow files).
