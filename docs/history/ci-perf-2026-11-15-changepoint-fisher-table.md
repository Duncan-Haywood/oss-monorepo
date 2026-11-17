# changepoint-detector: Fisher's g reads its trig from a table (2026-11-15)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run read the slowest venture suites.

## Reading

`platform/ci/venture_suite_times.json` (2026-11-15 00:25Z, 4 suites at once on
4 cores): league-schedule-generator 627 s, shift-roster-builder 571 s,
changepoint-detector 569 s, shed-designer 472 s. League had a pass this
morning (#16047), so this run timed every test file of the next three, run
4 at a time (`xargs -P4 node --test <file>`):

- **changepoint-detector**: 166 files, 404 s summed. The longest is now
  `engine.test.mjs` at 36 s (166 s before the 11-13 split), and then a flat
  spread: engine-trend-bends 30, joint-knots 25, drift-warning-null195-ar1 20,
  quiet-series 18, watch-workflow 17.
- **shift-roster-builder**: calc.test 88 s, cg-hardstop 71 s. `node --cpu-prof`
  on calc.test.mjs: `scoreDualCore` 36 s of 83 s. The slowest test (22 s)
  runs two `buildRoster` calls at 12 s and 10 s that stop on wall-clock budgets
  (dual branch 8 s, LNS 2 s). The 11-14 note found the same thing: a faster
  core buys more nodes, not less wall time. Left alone.
- **shed-designer**: browser.test 101 s, gallery.test 95 s and fuzz.test 77 s
  when run 4 at a time; run alone, gallery took 42 s (21 s of it idle,
  waiting on workers) and fuzz 28 s. No single hot function stood out.

## Profile

`node --cpu-prof` on the eval scripts behind the changepoint files that spawn
them: `pelt` 12.8 of 18.7 s (drift-warning-null195-ar1) and 9.1 of 16.4 s
(null195), almost all of it from `trendAdjust`'s `segment` (about 400 PELT
calls per `analyze`, about 10% of them with repeated inputs). `pelt` has
had two hand-tuned passes already, and the remaining calls are the fit's
iterations. Left alone (see "Not changed").

quiet-series spent 2.3 s in `fisherG` and djia-returns more. Counting calls
showed why: `fisherG` (the cycle check run on the residuals about the steps)
gets n = 7,980 and n = 8,609 there. It is O(n q) with a `Math.cos` and a
`Math.sin` per term: **679 ms** for one call at n = 8,609. That is also what a
user waits for on a long daily series.

## Change

`cos(2 pi k t / n)` and `sin(...)` depend only on k t mod n. `fisherG` now
builds one table of n cosines and n sines, `2 * Math.PI * j / n` for j < n, and
walks it with an index that steps by k and wraps at n. The sums run in the same
order. The values are not bit-identical: the old argument `2 * Math.PI * k * t / n`
carried a rounding error that grew with k t, and the table's angle is exact in
the integer, so the new sums are, if anything, the more accurate ones.

## Verification

- **Decisions unchanged** (old `engine.mjs` from `HEAD` against the new one):
  3,206 residual series, made up of every numeric column of every CSV in
  `data/` (raw, and the residuals about the default PELT steps), plus 3,000
  synthetic series (noise, clear cycles, weak cycles near the 0.01 line,
  random walks; n 60 to 9,060). The peak frequency was the same in all 3,206.
  The largest relative change in g was 4.5e-13, in p 1.4e-11. The p < 0.01
  decision flipped in 0 cases, and the rounded period and p in the warning
  text changed in 0.
- **Whole output unchanged:** `analyze` on the 81 real series in `data/` with
  default, `meanvar` and `trend: 'bends'` options gave byte-identical JSON in
  243 of 243 runs.
- **Pinned:** the new `fisher-table.test.mjs` checks the table against the direct
  sums on 40 seeded series (same peak, g to 1e-10), plus a clear 12-point cycle
  and the q < 2 and zero-power edge cases. It runs in 0.25 s.
- `python3 platform/ci/run_venture_tests.py changepoint-detector`: ok, 122.6 s
  wall (the suite alone on 4 cores).

## Numbers

| measure | before | after | how |
|---|---:|---:|---|
| `fisherG`, total over the 3,206 series | 29,575 ms | 2,530 ms | `performance.now()` around each call, same process |
| `analyze`, DJIA (n = 8,609), defaults | 1,558 ms | 922 ms | median of 5, same process |
| djia-returns.test.mjs | 11.8 / 12.1 / 12.7 s | 10.5 / 9.7 / 10.8 s | `node --test` on the file alone, 3 runs |
| quiet-series.test.mjs | 14.5 / 14.6 / 14.7 s | 12.1 / 12.5 / 12.4 s | same |

The suite's critical path is still `engine.test.mjs` (36 s), so the suite's
wall time falls by about the 4 to 5 s these two files lose, spread over 3
workers. The larger gain is the page: a 41% shorter wait on long daily series.

## Not changed, ranked for the next run

1. **`pelt` inside `trendAdjust`** (13 of 19 s in the null195 evals). About 10%
   of calls repeat an earlier input exactly, so a memo keyed on the series
   would be exact but small. Fewer iterations would change output.
2. **`spawnSync` in the eval-pinning tests** (drift-warning-null195 15 s,
   -ar1 19 s, watch-workflow 16 s): the child does the engine work, so the
   test's cost is the eval's cost. Running the eval in-process would stop
   testing the script as committed.
3. **The `lgamma` pair in `studentLogPdf`** (from the 11-14 list): still exact
   and still small.
4. **shift-roster-builder's calc.test (88 s)** and cg-hardstop (71 s) are wall-clock
   budgets, not compute. Cutting them would be a test change, not a speed-up.
5. P063 and P064 remain owner-gated.
