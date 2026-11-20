# CI perf 2026-11-20: an orphaned `sleep` and a unit test that fetched

Perf track. Both open perf backlog items (P063, P064) touch workflow files and
wait for the owner, so this run took a fresh pool reading (step 2 of the perf
prompt).

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-19T22:51Z to
2026-11-20T00:07Z): 566 jobs, 671.7 job-minutes. ventures tests: 24 jobs,
97.7 min, of which "node --test in each touched venture" was 72.5 min (about
3 min a job).

Two job logs on main showed where that step's time went:

| run | venture suites | `unwired_checks.run_everything()` |
|---|---|---|
| 44639959884 (open-tennis-robots) | 1.0 s | 133.6 s (23:44:10.9 to 23:46:24.5) |
| 44640581736 (changepoint-detector and two others) | 278 s | 165 s (23:53:09 to 23:55:54) |

So every ventures-tests job pays about 2.2 to 2.8 minutes for the 265 unwired
tree checks and suites, whatever venture it tests. On 2026-11-14 the same call
took 42 s (`ci-perf-2026-11-14-icon-memo-unwired-pool.md`).

## Profile

A scratch bench wrapped each runner in `run_everything()` with a timer (this
container, 4 cores, the default 6 workers): **157.0 s** wall, 745.7 s summed
over items. Top items in the pool:

| item | in the pool | alone |
|---|---|---|
| `test_friction_rank.py` | 78.4 s | 7.0 s |
| `check_posts.py` | 56.4 s | 1 s |
| `test_check_hidden_unicode.py` | 34.5 s | 3.6 s |
| `test_wait_for.py` | 30.1 s | 30 s (its tests sum to 2.5 s) |

Two causes, both in test code:

1. **`test_wait_for.py`: an orphan holds the pipe.**
   `Gone.test_waits_for_a_named_process_then_returns` starts
   `sh -c "sleep 30 # <tag>"` and ends with `p.kill()`. That kills the shell;
   its `sleep` lives on, holding the test process's stdout. The test finishes
   in 0.01 s, but anyone reading the suite's output with `capture_output`
   (`unwired_checks.run_suite`, or a `| tail` in a terminal) waits for EOF: 30 s.
   Timed alone: `python3 -m unittest test_wait_for.Gone.test_waits_for_a_named_process_then_returns | cat`
   took 30.05 s.
2. **`test_friction_rank.py::test_main_json`: real git and network.** It ran
   `friction_rank.main()` with git and the open-PR read on, so a unit test ran
   `git fetch --shallow-since=...` on the real clone (reports dated
   2026-11-01 predate the shallow edge) and read api.github.com three times.
   cProfile alone: 5.1 of 6.9 s in `select.poll` (the fetch child) and 0.6 s in
   SSL reads. Inside the pool the fetch competes with 5 other workers, and every
   git command beside it (`check_posts.py`'s merge-base and diffs among them)
   slows with it.

## Change

- `test_wait_for.py`: the shell runs in its own session with stdio on
  `/dev/null`, and the test kills the process group (`os.killpg`), so the
  `sleep` dies with the shell.
- `test_friction_rank.py::test_main_json`: stubs `revs`, `changes`,
  `basename_counts` and `open_prs` the way the neighbouring tests already do
  (`test_main_deepens_only_when_reports_predate_the_edge`), and fails if
  `deepen` is called. The full default `main()` path still runs; the test now
  also asserts the PR read happened (`prs == []`, not `None`). The real
  fetch path keeps its own stubbed tests.

No check, suite or assertion is dropped; `unwired_checks.py` itself is unchanged.

## Verification

- `python3 -m unittest test_wait_for test_unwired_checks`: OK.
  `pytest test_friction_rank.py`: 24 passed in 0.67 s (was 7.0 s).
- `python3 -m unittest test_wait_for`: 2.5 s (was 30 s).
- The bench, after: 265 items, 0 failures, same set as before.

## Numbers (4-core container, wall clock, `run_everything()` in-process)

| | before | after |
|---|---|---|
| default pool (6 workers) | 157.0 s | 94.3 s and 96.3 s |
| summed item time in the pool | 745.7 s | 521.5 s |
| serial (1 worker) | not taken | 341.9 s |

On CI the unwired phase should drop by a similar share, about 60 s a job; with
about 24 ventures-tests jobs per 75 minutes that is roughly 24 job-minutes in
that window. Check "node --test in each touched venture" in `ci_profile.py`
against the 72.5 min / 24 jobs baseline after a day.

## Not changed, ranked for the next run

1. **Paired checks.** `check_X.py` and `test_check_X.py` cost about the same
   for several X (plan_limits_2026 8.6/9.7 s, agent_text_on_pages 7.8/8.1 s,
   open_range_messages 6.1/6.1 s, dst_day_step 5.3/5.4 s, csv_formula_guard
   6.3/4.8 s serial): the suites seem to run the real tree scan. Moving those
   to fixtures would cut about 35 s of work.
2. **`test_research_homepage_publish.py`** is now the longest item (16.9 s
   serial, 23.6 s pooled) and sets the tail.
3. **Oversubscription.** 6 workers on 4 cores turn 342 s of work into 522 s.
   Matching workers to cores was measured negative for venture suites
   (`ci-perf-2026-11-07-venture-test-concurrency-negative.md`); untested here.
4. **Longest-first order** across the pool (node suites and Python suites go
   first today, checks last), as `run_venture_tests.py` does for suites.
