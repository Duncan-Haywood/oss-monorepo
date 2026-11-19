# CI perf, 2026-11-18: saas-feature-packaging-optimizer prices the last plan by counting

**Why this suite.** The 2026-11-11 suite-time table
(`docs/reports/venture-suite-times-2026-11-11.md`) lists
saas-feature-packaging-optimizer at 13.5 s (under load). The 2026-11-17 pass
(`ci-perf-2026-11-17-packaging-ladder-prefix.md`) halved it. It ranked "a
threshold sweep over the last plan's sorted candidates" second and left it
because "the tie branch is not monotone in price and buyer sums would change
order". This run takes that item and answers both objections (below).
Re-timed alone in an idle 4-core container (Node 22), the suite took 5.6 to
6.3 s, almost all of it in `calc.test.mjs`'s "the search stays fast at the
largest size" (4.5 s). That test runs the same `analyze()` the page calls on
its main thread when someone clicks Analyze, so the page froze for as long.

**Profile.** A scratch benchmark ran `analyze()` on five seeded surveys (500x8
features x3 plans, 300x8x3, 200x6x2, 500x8x2, 120x5x3 with a locked feature)
and hashed every result's JSON. `node --cpu-prof`, self time summed per function:

| function | self ms |
|---|---:|
| `go` (ladder price search, inner loop) | 7,844 |
| `refine` (exact one-price-at-a-time slide) | 2,825 |
| everything else | < 400 |

About 90% of `go` is its last depth. For each choice of the lower plans' prices
it tries every candidate price for the top plan (up to 24) and loops over every
respondent, so the work is about 24 x n per prefix.

**Change (the 2026-11-17 note's item 2).** `lastLevel()` in `calc.mjs`. For a
fixed prefix, whether a respondent switches to the top plan at price p is the
plain loop's own test. Every candidate above the lowest allowed one is strictly
above every lower plan's price (prices are ordered and candidates distinct).
On those candidates the test is true for a run and then false, so a binary
search finds where the run ends, and difference arrays add the respondent's
weight to every candidate in it. The lowest allowed candidate is tested
directly. It is the one place p may equal a lower plan's price, where the tie
rule's `p > cur[b]` can fail. Per prefix the work becomes about
n x log2(24) + 24 x k.

Exactness rests on the sums. The plain loop adds weights in respondent order;
the counting pass adds them in another order. Whole-number weights whose total
is a safe integer make every partial sum exact in any order. So the pass runs
only then (`wholeWeights()`). That is the default, since survey weights are 1
unless someone types one. Fractional weights keep the plain loop.
`priceLadder(..., {sweep: false})` forces the plain loop for the test.

**Verification.**

- Scratch benchmark digest (SHA-256 of all five `analyze()` results)
  `b7d02bf8…62f6f0b0`, identical before and after.
- New test "the last-plan counting pass returns exactly what the plain loop
  returns": 60 seeded placements over 1 to 3 plans, 2 to 6 features, weights
  1 to 3, value ranges as small as 0 to 6 (many exact ties), quick and exact
  ladders, plus a fractional-weight case. It `deepEqual`s the two paths.
- Two mutants each fail it: `p0 >= cur[b]` in the lowest-candidate test, and
  dropping runs of length one (`lo > j0 + 1`).
- `node --test` on the three test files: 28 pass (27 before plus the new one).
  `run_venture_tests.py saas-feature-packaging-optimizer`: 0 failed.

## Numbers

| measure | before | after |
|---|---:|---:|
| suite (`node --test` on 3 files), idle, 3 runs | 6.25 / 6.09 / 5.64 s | 3.49 / 3.25 / 3.16 s |
| scratch benchmark, 5 surveys | 10.5 s | 5.8 s |
| largest survey (500 x 8 x 3), what the page waits on | 4.3 s | 2.3 s |
| page's own example (86 respondents), 5 warm runs | 285-325 ms | 110-140 ms |

Profile after: `refine` 2.7 s, `lastLevel` 1.7 s, `go` 0.8 s.

## Not changed, ranked for the next run

1. **`refine`, now the largest cost** (543k `profitOf` calls, each O(n x k), in
   the benchmark). For the top plan, the same counting trick applies directly:
   the prefix state is fixed and no plan comes after it. Points are tested in
   Set insertion order with best-so-far acceptance, so compute the profits
   first and accept them in the original order. For a middle plan, a later plan
   can overtake it inside the 1e-12 tie window, and exactness needs a proof
   this run did not attempt.
2. **Run `analyze()` in a Web Worker** like league-schedule-generator's bowling
   page (`bowling-worker.mjs`), so the remaining 2.3 s on a 500-row survey does
   not freeze the tab.
3. Other suites timed this run, none profiled: einvoice-preflight 10.3 s spread
   over ~200 files (largest `zatca-stamp.test.mjs` 1.5 s), container-load-planner
   3.6 s, event-seating-chart-optimizer 3.2 s.
