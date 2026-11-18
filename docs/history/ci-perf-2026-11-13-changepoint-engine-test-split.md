# changepoint-detector: engine.test.mjs split, and `--test-force-exit` was silently dropping tests (2026-11-13)

Perf track run. It set out to shorten the slowest venture suite and found that
the venture test runner had been reporting green suites that had not run all
their tests.

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --top 20` (2026-11-13 13:37Z to
14:36Z): 287 jobs, 315.9 job-minutes, checkout 92.2. "ventures tests" took 50.2
job-minutes over 12 jobs, 40.6 of them in "node --test in each touched venture".
Portfolio Pages was larger (124.1 min). Its site-builder suite has had more than
a dozen passes already, and the two open perf backlog items (P063, P064) are
owner-gated.

The 12 most-touched ventures in recent history, run through
`run_venture_tests.py --jobs 4 --slowest 15` on this 4-core sandbox, ranked
changepoint-detector 591 s, shed-designer 533 s, shift-roster-builder 492 s,
photo-editing 361 s. Those numbers were taken with four suites running at once.

## Profile

Running the 157 changepoint files one at a time added up to 589 s, and
`engine.test.mjs` alone took **166 s**. Next came quiet-series at 32 s and
drift-warning-null195-ar1 at 28 s. `node --test` runs 3 files at a time on 4
cores (availableParallelism - 1), so the ideal wall time is about 196 s. Alone,
the suite took **255 s** wall (`node --test --test-force-exit`, the runner's
command, 641 tests). The one 166 s file was the tail.

Within that file, the nine trend-bend tests took about 105 s. Test 42
(sticky noise, `--ar1`) took 31.7 s. `--cpu-prof` on it: `pelt` 17.1 s
self-time of 23.7, called from `trendAdjust`'s `segment`. 10.9 s of that came
through the knot-range scan and 5.0 s through the greedy grid. Counted with
temporary counters (since reverted): 9,710 PELT calls over 10 `analyze` calls,
n = 240, an average of 77 live candidates per step. That is about 10 ns per
inner step. The loop is already tight, and the earlier passes
(`ci-perf-2026-11-11-pelt-inner-loop.md`, `ci-perf-2026-11-12-trend-fit-memo.md`)
took the exact wins. Fewer calls (warm starts, a reciprocal of `s2`) would
change outputs.

## Change 1: split the file

`engine.test.mjs` 94 tests became 85 + 4 + 5. The tests moved unchanged into
`engine-trend-bends.test.mjs` (one and two knots, refinement, sticky noise) and
`engine-trend-joint-knots.test.mjs` (joint knots, least-squares pair, knot
margin). The new files copy the seeded `rng`/`normals` helpers, as 15 other test
files in the venture already do. The README's references to `engine.test.mjs`
all point at tests that stayed.

## Change 2: the runner stops passing `--test-force-exit`

The first after run reported **587** tests where the before run had 641, with
exit 0 and nothing failed. The missing 53 were the second half of
`engine.test.mjs`. Run alone, the file passed 85 of 85. Run alone with
`--test-force-exit`, it gave 43, then 38. The unsplit file on `main` gave 94,
then 42. Each truncated run cut off at a different test, and none printed an
error.

Minimal repro, outside the repo (Node 22.23.4): 60 tests, every tenth one
busy-waiting 6 s and the others allocating.

| command | tests reported |
|---|---|
| `node --test --test-force-exit` | 39, 54 |
| `node --test` | 60, 60, 60 |
| `node --test-force-exit file` (no runner) | 60, 60 |

So the bug sits in runner mode with the flag. `run_venture_tests.py` has passed
it since the red-team run of 2026-11-12, which checked it on einvoice-preflight
(1580 of 1580 either way, whose tests are short). Since then, a green
"ventures tests" job has not proved that a long-running file ran all its tests.

The flag was there so that a server suite whose failing assertion skips its
`close()` fails at once instead of at `SUITE_TIMEOUT`. `run_one` now does that
itself. It reads the output as it comes, and once a line matches `not ok N`
and the suite has been quiet for `FAIL_QUIET` (10 s), it kills the process
group. Only a suite that is already red can be stopped early, so a failure
cannot turn green and no test can go missing from a green run. The existing
test `test_a_failing_test_that_leaves_a_server_open_fails_fast` still passes
(it now stops at the quiet limit). A new test,
`test_node_test_runs_without_force_exit`, pins the flag's absence and that a
40-test file with slow tests reports `# tests 40`.

## Verification

- `python3 -m unittest test_run_venture_tests` in `platform/ci`: 31 tests, OK.
- changepoint-detector through the fixed runner (`run_venture_tests.run`):
  **641 of 641 pass, 214 s** wall, against 255 s before (641 of 641, taken with
  the flag but on a run that happened to report every test). The split file's
  three parts together report 94 tests.
- Every venture suite without the flag: 1348 run, 0 failed (below).

## All suites without the flag

`python3 platform/ci/run_venture_tests.py --jobs 4 --slowest 10` over every
venture, with the fixed runner: **1348 suites run, 0 failed** (exit 0). The
tests the flag may have skipped since 2026-11-12 were not hiding a failure on
`main` as of this run. The slowest suites, with four running at once:
changepoint-detector 754 s, shed-designer 655 s, shift-roster-builder 639 s,
league-schedule-generator 580 s, ai-bookkeeper 194 s, wall-framing-takeoff 186 s.

## Not changed, ranked for the next run

1. Other single-file tails. The per-file listing method in this doc
   (`for f in *.test.mjs; time node --test $f`) shows them. Splitting is safe
   and exact, and pays only when one file is more than about a third of its
   suite's serial time.
2. `pelt` call count in `trendAdjust`'s knot-range scan (10.9 of 17 s in
   test 42). Any cut there is an output change: a product decision, not perf.
3. Whether Node's runner-mode `--test-force-exit` bug is filed upstream. It was
   not checked from here. A minimal repro is in this doc.
4. P063 and P064 remain owner-gated.
