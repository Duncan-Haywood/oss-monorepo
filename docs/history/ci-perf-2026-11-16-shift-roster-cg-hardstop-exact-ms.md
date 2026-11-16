# shift-roster-builder: the stopped-column-generation test stops waiting on the exact search (2026-11-16)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch workflow files
and still wait for the owner, so this run read the venture suite times.

## Reading

`platform/ci/venture_suite_times.json` (2026-11-16 03:01Z, 4 suites at once on 4
cores): league-schedule-generator 627 s, **shift-roster-builder 571 s**,
shed-designer 472 s, changepoint-detector 153 s. The other three had perf passes
on 2026-11-15 and 2026-11-16; shift-roster-builder's last was 2026-11-14.

Each of its 70 test files alone, 4 at a time (`node --test --test-reporter=tap
<file>`, wall time with `date`), top six: calc.test.mjs 105 s,
**cg-hardstop.test.mjs 81 s**, open-sums.test.mjs 54 s, cover-guide.test.mjs
33 s, day-lns.test.mjs 31 s, keep-shifts.test.mjs 20 s. Inside cg-hardstop, test 2
("a stopped column generation never bounds above the proven best") was 61.6 s.

## Where the 61 s went

The test builds three 8 x 20 weeks. On each it runs one full `buildRoster`
(0.1 to 0.5 s: column generation proves the roster) and then two with column
generation cut to 0 ms and 5 ms. The cut calls took 9.4 to 11.2 s each. Their
`timings`: exactSearch 9,336 ms of about 10,600 (coverPass 801, the rest under
110 each). With the proof left open by the cut, the exact search's tree runs to
its default `exactMs` of 8 s, on a week where the test does not look at the tree.

What the test checks are the two bounds a stopped column generation produces: the
first pass's (`optimality.scoreCG.bound`) and, through `lowerBound`, the
open-hours row's (`openRow`, a second column generation that runs *inside* the
exact search with the same cut `scoreCGMs`).

## Change

The cut calls pass `exactMs: 300`. The test also asserts the open-hours row's
bound directly (`optimality.openRow.bound <= best`) when the row ran.

Not a speed-up of the solver: the solver is unchanged. It is a test that stops
paying for a phase it does not test. What shows the test is no weaker:

- **Both stopped passes still run.** At the default 8 s and at 300 ms, the
  open-hours row ran on all 6 cut calls (`openRow` non-null) and the first pass
  stopped mid-round on all 6 (`stoppedMidRound 1`). At 1,000 ms it did not: two
  5 ms calls finished their first pass and skipped the row, so 300 is the
  budget, not 1,000.
- **Seeded faults** (in `calc.mjs`, reverted):
  - first pass's bound and floor raised by 1e9 when not proven: new test fails
    (`seed 0, 0 ms: bound 1000000000 above the best`);
  - open-hours row's `floor` raised by 1e9 when not proven: new test fails on
    the new assertion (`seed 0, 0 ms: open-hours row bound 1000000000 above the
    best`); the old test also failed, later, through `lowerBound` on seed 2.
- The tree's own bound at 8 s is the exact search's, and its soundness is
  tested elsewhere (calc.test.mjs "the exact bound ... never overstates",
  "exact mode gives up honestly").

## Numbers

`node --test --test-reporter=tap cg-hardstop.test.mjs`, alone, twice each way
(`git stash` for before):

| | test 2 | file |
|---|---:|---:|
| before | 58.9 s, 59.5 s | 75.8 s, 77.1 s |
| after | 13.1 s, 13.0 s | 30.2 s, 29.8 s |

About 46 s of CPU per suite run. The suite's wall time is set by its longest
file chain on the runner's cores, so the saving on the clock is less than that.

## A red test from main, fixed on the way

PR #16481's first `changed-ventures` run failed on a test merged into main an
hour earlier (PR #16466, `repair-flow.test.mjs` "the repair reserve is on by
default from 300 copies"): `coverRepairReserveMs` was `null`, not 300. The
reserve is only set when the cover passes start. On the 90 x 252 bench week at
`timeBudgetMs: 3000`, anneal (about 0.3 s), ejection (about 2.0 s) and column
generation (at least 1 s, by design) used the budget first: `timings` alone here
were 291 + 1,959 + 1,034 ms with no `coverPass`, and 4 of 4 copies run at once
failed. The big build now gets 10 s with one cover pass and no day sweeps
(neither changes the default), and expects 1,000 ms (a tenth of the budget). It
passed 4 of 4 copies at once and alone. The small week stays at 3 s: at 10 s,
column generation sometimes proves it, and the reserve is then `null` because no
pass runs. Cost: that test went from 5.5 s (and flaky) to 14.6 s, so the suite
nets about -37 s of CPU, not -46 s.

## Not changed, ranked for the next run

1. **calc.test.mjs (105 s).** Its slowest tests: "the exact bound sees that
   hours, overlaps and rest force shifts open" 26.9 s, "the 7-person sample week
   is proven inside the default limits" 18.7 s, "exact mode gives up honestly"
   14.9 s, "buildRoster proves the sample week by whole-score column generation"
   14.2 s. These do test the exact search, so the budget is the subject. Look for
   cut calls that only read an earlier phase, as here.
2. **cover-guide.test.mjs test 3 (31.5 s, 24 `buildRoster` calls).** Checked: the
   time is in `coverPass` and `coverRepair` (up to 1.3 s each per call), the
   passes the test is about; the exact search takes 0 ms. Nothing to cut without
   changing what it tests.
3. **day-lns.test.mjs tests 5 and 6 (15 s each), open-sums.test.mjs (54 s).**
   Not profiled this run. open-sums was the clock-budgeted test of
   `ci-perf-2026-11-14-shift-roster-flat-sets.md`.
4. P063 and P064 remain owner-gated (workflow files).
