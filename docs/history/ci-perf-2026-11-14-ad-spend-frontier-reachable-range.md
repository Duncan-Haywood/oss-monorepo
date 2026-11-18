# Venture suites: the ad-spend budget frontier only visits reachable totals (2026-11-14)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner, so this run took item 3 of "Where to look": the
slowest local step a session waits on, the venture suites, and looked for a
suite that had never had a perf pass.

## Reading: every venture suite

`python3 platform/ci/run_venture_tests.py --slowest 40 --no-elsewhere`, this
container (4 cores, node 22), 2026-11-13/14. One failure:
shed-designer's `browser.test.mjs` "ready-design gallery" test timed out
(`#starts-next` stayed disabled for 30 s, test 44 s) while four suites ran at
once; it is a browser timing test under load, not something this run touched.
The slowest suites:

| venture | s (4 at once) | perf passes before this one |
|---|---:|---|
| changepoint-detector | 538.6 | several |
| league-schedule-generator | 500.6 | several |
| shift-roster-builder | 314.5 | several |
| shed-designer | 174.5 | several |
| ai-bookkeeper | 164.1 | 2026-11-13 |
| wall-framing-takeoff | 148.3 | 2026-11-13 (x2) |
| einvoice-preflight | 49.4 | several |
| clothing-design-studio | 47.7 | 2026-11-13 |
| **ad-spend-saturation-optimizer** | **46.5** | **none** |
| open-house-plans | 45.1 | 2026-11-13 |

Per file in ad-spend-saturation-optimizer (`node --test <file>`, one at a
time): `calc.test.mjs` **28.8 s**, `cli.test.mjs` 9.1 s, the rest under 1 s.
Inside `calc.test.mjs` one test was 21.0 s of the 28.9 s: "allocate matches the
analytic equal-marginal-return optimum for two exponential channels".

## Profile

That test calls `allocate(curves, 20, { steps: 800 })` with each channel's
upper limit at 1000, so `frontier()` (the exact budget dynamic programme) runs
over 80,000 unit totals with up to 40,001 choices per channel. The old loop
visited every `u` from `lo` to `min(hi, b)` for every `b` from 0 to `T` and
skipped the ones whose base total `b - u` was unreachable (`-Infinity`). For
the first channel only `b - u = 0` is reachable, and for the second only
`b - u <= 40,000`, so about a third of the 2.4 billion visits were skips, and
the first channel's 1.6 billion were almost all skips.

## Change

`frontier()` (`ventures/ad-spend-saturation-optimizer/calc.mjs`) tracks
`[pLo, pHi]`, the totals the channels so far can reach, and loops only over
`b` in `[pLo + lo, pHi + hi]` and `u` in `[max(lo, b - pHi), min(hi, b - pLo)]`.
Everything outside was `-Infinity` and skipped before; the `-Infinity` check
stays for curves that return `-Infinity` or `NaN` inside the range. Same `u`
order and the same strict `>`, so ties go to the same `u`. The tables are
`Float64Array` instead of filled arrays, and the best value for each `b` is
kept in a local.

## Verification

- A bench (scratch, not committed) hashes `minUnits`, `maxUnits`, `lo`, `hi`,
  `revenueAt(b)` and `at(b)` for every `b` from -1 to `T + 1` on four curve
  sets (the slow test's, two S-curves, four channels with lower limits and a
  `NaN` stretch, and a `-Infinity` channel): hash `bd9dc958f7618337` before and
  after. Time **20.8 s before, 6.0 to 6.3 s after** (three runs).
- `node cli.mjs` with `--example --json`, `--example`, `--example --budget
  12000 --json` and `--example --csv`: the concatenated output has the same
  sha256 before and after.
- New test, "frontier equals the plain every-u-at-every-b programme, lower
  limits, ties and gaps included": the old loop, written out in the test, is
  compared with `frontier()` at every total, units included, on three curve
  sets (one where every split ties). It passes on the old and new code, and
  fails on each of three mutants (upper `u` bound one short, lower `u` bound
  one high, `>=` for `>`).
- `python3 platform/ci/run_venture_tests.py ad-spend-saturation-optimizer`:
  **29.3 s before, 13.7 s after** (suite alone). `calc.test.mjs` alone:
  28.9 s before, 13.4 s after.

## Not changed, ranked for the next run

1. **The slow test is still about 6 s.** It asks for the split of a 20-unit
   budget with each channel allowed up to 1000, so the frontier is built over
   80,000 totals to read one. Real inputs cap each channel at 1.25x its highest
   week and use 400 steps, so `T` is a few thousand. Lowering the test's `hi`
   to 20 would ask the same question in milliseconds, but it is a change to a
   test's input, so it was left for a product run to judge.
2. **`cli.test.mjs` 9.1 s**: not profiled. It spawns the CLI several times,
   each running `analyze` with 100 bootstrap refits.
3. shed-designer's gallery browser test timed out once under a 4-at-once
   sweep (above). Not seen alone; worth a look if it recurs in CI.
4. gaussian-process-regression (29.0 s) and sprinkler-hydraulic-calc (16.7 s)
   have had no perf pass.
5. P063 and P064 remain owner-gated (workflow files).
