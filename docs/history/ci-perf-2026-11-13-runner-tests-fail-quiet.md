# Ventures-tests runner unit tests: the fail-fast test no longer waits 10 s (2026-11-13)

Perf track. Both open perf backlog items (P063, P064) touch workflow files and
still wait for the owner, so this run took the pool reading instead.

## Pool reading

`python3 platform/ci/ci_profile.py --runs 300 --steps 30` (2026-11-13
22:13Z to 22:35Z, 293 jobs, 321.8 job-minutes, checkout 111.4):

| step | runs | min | median |
|---|---:|---:|---:|
| Portfolio Pages / Test the site builder | 13 | 52.3 | 230 s |
| ventures tests / node --test in each touched venture | 19 | 24.5 | 38 s |
| Portfolio Pages / Build the site | 14 | 16.9 | 81 s |
| **ventures tests / Runner unit tests** | 19 | 6.2 | **21 s** |

The site-builder test has had about twenty passes (`pages-test-perf-*`). The
fourth-largest step, `python3 -m unittest test_run_venture_tests` in
`platform/ci`, had none, and it runs on every venture PR before the venture
suites start.

## Profile

Locally the file took 21.9 s wall for 6.0 s of CPU: mostly waiting. Per-test
wall time (a `TextTestResult` subclass timing `startTest` to `stopTest`):

| test | before |
|---|---:|
| `test_a_failing_test_that_leaves_a_server_open_fails_fast` | **10.22 s** |
| `test_an_all_zero_base_means_every_venture` | 2.49 s |
| `test_a_hung_suite_is_killed_and_named` | 2.01 s |
| `test_node_test_runs_without_force_exit` | 2.00 s |
| the other 27 | under 0.5 s each |

The first one checks that a red `node --test` suite kept alive by an open
server is stopped once it has been quiet for `FAIL_QUIET` seconds instead of
running to `SUITE_TIMEOUT`. It patched `SUITE_TIMEOUT` down to 20 s but left
`FAIL_QUIET` at its production 10 s, so the test spent 10 s doing nothing.

## Change

`platform/ci/test_run_venture_tests.py`: that test also patches `FAIL_QUIET`
to 1 s. `run_one` reads the module global at call time, so the patch reaches
it. No production code changed; no assertion changed or removed.

## Verification

- The test, six runs: 1.21 s each, all pass.
- It still catches what it is for: with `FAILED_LINE` mutated so it never
  matches (the fail-fast path disabled), the test fails at 20.0 s on
  `assertNotIn("timed out", out)`. Restored afterwards.
- Whole file: before 19.5, 19.7, 21.9 s; after 10.46, 10.45, 10.36 s
  (`python3 -m unittest test_run_venture_tests`, 31 of 31 pass, same container).

About 9 s off each venture PR's ventures-tests job, roughly 2.9 of the 6.2
job-minutes this step spent in the window above.

## Not changed, ranked for the next run

1. `test_an_all_zero_base_means_every_venture` (2.5 s) runs `main` twice over
   every venture, and two thirds of that is `inherited_keys.scan_slugs` over
   every venture, twice. The test only checks `since_slugs` is not
   called; mocking `inherited_keys.new_hits` would take about 1.6 s, but it
   also drops the one place this file drives the real whole-repo path, so
   weigh that first.
2. `test_a_hung_suite_is_killed_and_named` waits the patched 2 s timeout and
   `test_node_test_runs_without_force_exit` busy-waits 1.8 s by design (it
   reproduces the Node 22.23 early-exit race). Neither is worth cutting.
3. P063 and P064 remain owner-gated (workflow files).
