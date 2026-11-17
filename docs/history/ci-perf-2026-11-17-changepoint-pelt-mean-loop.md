# CI perf, 2026-11-17: changepoint-detector, PELT's mean cost in a loop of its own

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/`, which CODEOWNERS holds for the owner. The three slowest suites in
`platform/ci/venture_suite_times.json` (league-schedule-generator,
shift-roster-builder, shed-designer) each had two or more perf passes on
2026-11-16, so this run took the fourth: changepoint-detector (152.9 s under
the four-suite pool).

## Reading

Each of the 183 `*.test.mjs` files alone, `node --test <file>`, four at a time
(`xargs -P4`), this 4-core container, main at `7c079ed06`. Sum 610 s. Top:
engine 42.9, engine-trend-bends 39.2, engine-trend-joint-knots 33.4,
drift-warning-null195-ar1 26.4, update-rate 22.6, update-rate-columns 22.2,
drift-warning-null195 21.8, watch-workflow 19.9. The engine files had passes on
2026-11-13 to 11-16; the two drift-warning evals had not been profiled since
`ci-perf-2026-11-12-trend-fit-memo.md`.

## Profile

`node --cpu-prof eval/drift-warning-null195-ar1.mjs` (240 `analyze` calls with
`drift: true, trend: 'bend'` on 195 points), 24.8 s wall. Self time: `pelt`
17.8 s (72%), `median` 1.6, `logAdd` 1.1, `bocpd` 1.1, the rest under 0.7.

Counted with an instrumented copy: each `analyze` makes 585 to 660 `pelt` calls,
all `model: 'mean'` (the `trendAdjust` fits: up to 10 passes plus a final one
per knot set over the greedy grid, the refinement and the knot-range scan).
Each call scores 7,400 to 17,700 start/end pairs out of about 19,000: with
the 3x penalty there are few changes, so K = 0 pruning keeps most starts. The
work per call is already minimal for exact PELT; the cost is per pair.

`pelt`'s one loop serves every model: the mean branch, the poisson branch and a
closure call, tested per pair. V8 does not unswitch the loop on the invariant
`mean` flag.

## Change

`engine.mjs`: `peltMeanLoop`, the step loop for `model: 'mean'` alone. Same
starts in the same order, same pruning test (`!(V[i] - beta <= prev)`), same
cost expression `Math.max(0, S2[t] - S2[s] - (a * a) / m) / s2` with
`a = S1[t] - S1[s]` in the same order, same `v < best` tie rule, same
`Number.isFinite(best)` gate on the new start. The only hoist is reading
`S1[t]`, `S2[t]` once per step, which reads the same values. The general loop
lost its now-unreachable mean branch.

Tried and dropped: the same split for `poisson`. 4,700 captured poisson calls
from `engine.test.mjs` went 1,112 ms to 1,077 ms (within noise): its time is
in `Math.log`, one per pair.

## Verification

- **Same answers.** Every `pelt` call made by 16 `analyze` runs of the
  drift-warning setup (6,225 calls, all `mean`) captured with input, options
  and result, then replayed against the new engine: 0 mismatches in
  changepoints, and `cost` equal with `===`. The same on 18,800 poisson calls
  and on the first 20,000 non-mean calls of `engine.test.mjs` (poisson, negbin,
  meanvar, ar1mean, trend): 0 mismatches.
- `node eval/drift-warning-null195-ar1.mjs` and
  `node eval/drift-warning-null195.mjs` are byte-identical to their committed
  `.out.txt` (`cmp`).
- Whole suite, `node --test *.test.mjs`: 790 of 790 pass, before and after;
  `python3 platform/ci/run_venture_tests.py changepoint-detector` green.

## Numbers

| measure | before | after | how |
|---|---:|---:|---|
| replay of 6,225 mean `pelt` calls | 704 ms | 543 ms (-23%) | median of 5, `bench.mjs` in one process |
| `eval/drift-warning-null195-ar1.mjs` | 24.8 s | 20.6 s (-17%) | `time node ...`, alone |
| suite wall, `node --test *.test.mjs` | 189.3 s | 184.5 s (-2.5%) | back to back, same container |
| sum of top-level test durations | 526.7 s | 510.3 s (-3.1%) | `duration_ms` of each file in the same two runs |

The suite-wall gain is small because the critical path is
`engine.test.mjs`, whose `pelt` time is poisson (48,403 calls, 14.3 s of its
39.7 s) and negbin (721 calls, 3.7 s), not mean.

## Not changed, ranked for the next run

1. **Poisson PELT in `engine.test.mjs`: 48,403 calls, 14.3 s.** One `Math.log`
   per pair; loop shape is not the cost. Fewer calls per analysis (the
   exposure/trend passes in the count path, line ~200 to ~310) or a tighter
   exact bound are the levers; both change more than the loop.
2. **`bocpd` 10.6 s and `logAdd` 3.6 s in `engine.test.mjs`.** Not profiled
   at the line level this run.
3. **The two null195 evals repeat 120 identical `analyze` calls**: the ar1
   eval's "raw bend" rows are the plain eval's "raw bend" rows (same seeds,
   same options, same output lines). Merging the two evals would save about
   10 s of CPU, but changes two committed eval scripts and their tests.
4. **Stronger exact pruning for the mean cost** (functional pruning, FPOP).
   Mathematically the same optimum, but its arithmetic differs, so a near tie
   could resolve the other way; it needs a tie bench, not just `cmp`.
5. P063 and P064 remain owner-gated (workflow files).
