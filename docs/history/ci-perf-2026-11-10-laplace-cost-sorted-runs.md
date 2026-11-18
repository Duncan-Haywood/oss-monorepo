# changepoint-detector: the robust cost keeps each segment sorted (2026-11-10)

**Where.** The perf backlog's two open items (P063, P064) are owner-gated
workflow edits, and the pool readings from earlier today found no new lever
(`ci-perf-2026-11-10-*.md`). So this run took step 3 of the perf prompt: the
slowest local suite an agent waits on. `changepoint-detector` is a flagship
that a session touches almost daily (PR #14621 today), and nobody had
profiled its 123 test files.

**Before.** `node --test --test-reporter=tap *.test.mjs` from the venture
folder, this 4-core container, Node 22.23.4: **7 min 10 s wall, 17 min 04 s
user CPU**, 424 tests pass, per-test `duration_ms` summing to 1,006 s. One test
took 183 s on its own: `eu-markets.test.mjs`, "cac: no cut near row 1482 under
--dispersion or --robust". Timing its three runs separately: plain 0.59 s,
`--dispersion` 0.47 s, **`--robust` 183.2 s**.

**Profile.** `node --cpu-prof` on the CAC `--robust` run, self time summed
per function: 124 s and 54 s in the two closures of the `meanvarlaplace` cost
(`makeCost`, `engine.mjs`), 4.7 s in GC, everything else under 1 s. The
cost answered each (s, t) by copying `x[s..t)`, sorting it with a comparator,
then summing absolute deviations about the median, and it memoised every pair
in a `Map`. PELT on 1,859 returns with few cuts barely prunes, so it asks for
about n²/2 = 1.7 M pairs, each sorted from scratch: O(n² · m log m). The
memo never hit within one PELT pass (each pair is asked once), so it only
added 1.7 M `Map` entries.

**Change.** PELT asks for each start s with t rising by one. Each start now
keeps a `Float64Array` of its segment in sorted order and takes `x[t-1]` with
one binary-search insert (`copyWithin`) per step. The median and the sum of
absolute deviations come from the same helper, in the same sorted order, so
every cost is bit-identical. Any other order of asking (`changeIntervals`, or
going back to an earlier t) falls back to the old copy-and-sort path,
memoised as before. Every 256 steps, buffers that haven't been touched for
256 steps are freed (a pruned start is never asked again, and one that is gets
rebuilt from `x`), so memory follows the starts still in play.

**Same answers.** The old and new closures, compared with `Object.is` over
755,282 calls: 40 random series of 20 to 320 points (heavy ties, ±0, plain
arrays and `Float64Array`), in PELT order and in random order with repeats
and backwards steps. 0 mismatches. A second check covered 260,904 calls on a
1,400-point series where starts drop out at random and a start is asked
again after the sweep has freed its buffer: 0 mismatches. The whole suite
passes (424/424) with the same pinned cuts.

**After.** Same command, same container:

| | before | after |
|---|---|---|
| CAC `--robust` alone | 183.2 s | 1.9 s |
| suite wall | 7 min 10 s | 6 min 38 s |
| suite user CPU | 17 min 04 s | 11 min 37 s (−32%) |
| summed test time | 1,006 s | 675 s |

The wall time moves less than the CPU because, with CAC gone, the critical
path is now `trend-*`/`drift-warning` (the `--ar1` trend-bend test at 95 s,
the AR(1) drift-warning tests at 91 s and 62 s). On a CI runner, where the
venture shares four cores with the other ventures a PR touches, the CPU
saving is the number that counts.

**A product result from it.** The README's DJIA section said `--robust`
"did not finish in 9 minutes on 8,609 points ... cause not profiled". It now
finishes in 9.0 s with 235 MB peak RSS (`process.resourceUsage().maxRSS`).
It makes 12 cuts, dates 2008-09-15 (Lehman) to the day and cuts 1987-10-06 for
the crash. The README gains the row, and `djia-returns.test.mjs` pins the 12
dates.

## Not changed, ranked for the next run

1. `trend bends with sticky noise: --ar1` (95 s) and the two AR(1)
   drift-warning tests (91 s, 62 s): now the suite's critical path. Profile
   `trendAdjust` with `ar1: true` before touching it.
2. `trend bends --joint-knots` (42 s, 39 s, 32 s): scores every knot pair,
   which may be minimal for what it does. Read `lsKnots` with a profile first.
3. The `changeIntervals` call after a `--robust` fit still goes through the
   copy-and-sort path (random access). It is small on these series; measure
   before changing it.
4. P063/P064 remain owner-gated.
