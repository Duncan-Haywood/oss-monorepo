# ad-spend-saturation-optimizer: one curve value per distinct spend, an in-place Nelder-Mead sort, and a test cap equal to its budget (2026-11-18)

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/` and wait for the owner. The three slowest suites in
`platform/ci/venture_suite_times.json` (league, shift-roster, shed) and the
next five have 9 to 25 perf write-ups each; ad-spend-saturation-optimizer
(17.4 s there, 2 write-ups) had item 1 and 2 of the "not changed" list in
`ci-perf-2026-11-14-ad-spend-frontier-reachable-range.md` still open.

## Reading

- `node --test --test-reporter=spec`: `calc.test.mjs` 10.0 s, of which one
  test, `allocate matches the analytic equal-marginal-return optimum`, took
  5.35 s; `cli.test.mjs` 5.6 s (CLI spawns, each running `analyze`).
- `node --cpu-prof` on five `analyze` calls on the bundled sample (plus
  `reportCsv` and four `budgetPlan` calls each), self time: the hill curve's
  bound closure 904 ms, the exp closure 474 ms, `nelderMead` 273 ms, GC
  133 ms. The closures are the `Math.pow`/`Math.exp` in each fit's SSE.

## Changes

1. **`fitCurve`'s SSE** (`calc.mjs`). A bootstrap resample draws n of n weeks
   with replacement, so about a third are repeats. The curve is now evaluated
   once per distinct spend into `gv`, and the squared errors are still summed
   point by point in the original order, so the sum is the same bit for bit.
2. **`nelderMead`** sorted its vertices each step by building an index array,
   sorting it with a comparator and mapping two new arrays. It now runs a
   stable insertion sort in place (strict `>`, so ties keep their order, as
   the stable `Array.prototype.sort` kept them) and reuses the centroid
   array. All arithmetic is unchanged.
3. **The slow test** (`calc.test.mjs`) capped each channel at 1000 for a
   budget of 20, so `frontier` built 80,000 totals to read one. The cap is
   now 20, the budget. At 800 units the DP reads only `u <= 800` from either
   channel, in the same order, so `allocate` returns the same spend
   (`[12.725000000000001, 7.275]`) and revenue (`117.98293620674329`) to the
   bit: checked by running both caps side by side (5648 ms vs 14 ms). The
   assertions are unchanged. (`atHigh` differs, and the test never read it.)

## Verification

- Identity script (scratch, not committed): sha256 over the JSON of 72
  `analyze` calls (seeds 1, 2, 3, 5, 8, 13; 20, 52 and 78 weeks; default,
  adstock off, another margin and seed, skip weeks with 40 resamples) plus
  `reportCsv`, `budgetLadder` and `snapshot` of each, 240 direct `fitCurve`
  calls on resampled points, and 180 `nelderMead` calls (Rosenbrock with a
  step term, an L1 bowl, an all-ties constant). Old and new code: the same
  digest, `4e0a90e5...dc69ca9`.
- `python3 platform/ci/run_venture_tests.py ad-spend-saturation-optimizer`,
  alternating with `git stash`, five pairs, the runner's own time: before
  10.4, 10.5, 10.3, 10.7, 10.6 s (median **10.5 s**); after 5.6, 5.2, 5.1,
  5.0, 5.0 s (median **5.1 s**). 71 tests both ways.
- Five `analyze` calls on the sample (what the page runs on "Use the example"),
  alternating, five pairs: before 2227, 2216, 2188, 2126, 2223 ms (median
  **2216**); after 1872, 1954, 2023, 1993, 1888 ms (median **1954**), 12% off,
  output digest `56d4df84...` both ways.

## Not changed, ranked for the next run

1. **The fits themselves.** The full-data hill fit runs 18 Nelder-Mead starts
   of up to 600 steps; the `Math.pow` per point per evaluation is most of the
   remaining time. Fewer starts or a looser `tol` would move fitted numbers:
   a product change, not a speed-up.
2. **`cli.test.mjs` (about 5 s):** five tests spawn the CLI, each paying Node
   start-up plus one or two `analyze` calls. Sharing one spawn across
   assertions would change what each test isolates; left alone.
3. **`fitAdstock`** fits the exp curve once per carry-over rate (5 rates x 9
   starts) before `fitBest`; the rates could share a warm start, but that
   changes which local optimum a start lands in.
4. saas-feature-packaging-optimizer's largest-size search (7.8 s) and
   rrule-explainer's randomized sweeps remain from the 2026-11-16 list.
