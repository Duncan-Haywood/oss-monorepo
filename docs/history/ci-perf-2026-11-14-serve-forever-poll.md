# Perf, 2026-11-14: half a second per stopped test server

## Reading

Every `platform/ci/test_*.py` file (136) timed with `python3 -m unittest
<file>`, two at a time, in a 4-core cloud container. The top entry
(`test_check_conflict_markers.py`, 14.9 s) was a cold file cache: alone and
warm it takes 2.1 s. The top eight re-timed one at a time, warm:

| file | seconds |
|---|---|
| test_run_venture_tests | 9.8 |
| test_browser_checks | 8.7 |
| test_adopt_stranded | 7.8 |
| test_research_homepage_publish | 7.3 |
| test_run_workflow_locally | 6.9 |
| test_check_storage_guard | 6.1 |
| test_unlanded_work | 6.1 |
| test_check_venture_regression | 5.7 |

Per-test timing of the top two: `test_run_venture_tests`' cost sits in three
tests of about 2 s each that wait on real `node --test` children on purpose
(a timeout, a no-force-exit run, the all-ventures listing). `test_browser_checks`
had about fifteen tests at **0.51 s** each, which is too even to be work.

## Cause

`socketserver.BaseServer.serve_forever(poll_interval=0.5)` checks its stop
flag once per poll, so `shutdown()` blocks for up to 0.5 s.
`browser_checks.serve()` started the loop with the default, and `main()`
stops the server in its `finally`, so every `RunOutcome` and `Sentinel` test
paid half a second doing nothing.

## Change

- `platform/ci/browser_checks.py`: `serve()` passes `poll_interval=SERVE_POLL`
  (0.05 s). Idle cost: 20 `select()` calls a second while a check runs. Real
  runs (`browser-checks-ci.yml`) also stop 0.45 s sooner.
- The same default in two other test servers stopped per test or class:
  `research/_shared/test_remote_zip.py` (one server per test) and
  `platform/ci/test_site_probe.py` (one per class).

Nothing else changed: same handler, same served bytes, same tests.

## Verification

Three runs each, same container, `python3 -m unittest <file>` wall time:

| file | before | after |
|---|---|---|
| platform/ci/test_browser_checks.py (55 tests) | 8.68 / 8.69 / 8.72 s | 1.04 / 1.05 / 1.06 s |
| research/_shared/test_remote_zip.py (5 tests) | 3.13 / 3.16 / 3.13 s | 0.45 / 0.43 / 0.40 s |
| platform/ci/test_site_probe.py (13 tests) | 0.63 / 0.62 / 0.12 s | 0.18 / 0.18 / 0.17 s |

All tests pass before and after (55, 5, 13). In total about 10.5 s less per
pass of these three files.

## Not changed, ranked for the next run

1. **`test_run_venture_tests.Selection.test_an_all_zero_base_means_every_venture`**
   (2.0 s): `has_tests` is mocked, so the time is likely the ventures listing
   itself, done twice. Profile it before touching it.
2. **`test_adopt_stranded.py`** (7.8 s) and **`test_research_homepage_publish.py`**
   (7.3 s): not yet profiled per test.
3. The two deliberate 2 s `node --test` waits in `test_run_venture_tests`
   (`SUITE_TIMEOUT` 2 s, a 400 ms busy loop) pin real behaviour; leave them.
4. Any new `serve_forever` in a test: `grep -rn serve_forever --include=*.py`
   finds them; pass `poll_interval` when the server is stopped per test.
5. P063 and P064 remain owner-gated (workflow files).
