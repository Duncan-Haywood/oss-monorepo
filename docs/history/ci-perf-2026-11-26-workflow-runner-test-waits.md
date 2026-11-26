# Local workflow-runner tests: stop waiting on sleeps and the real checkout (2026-11-26)

Perf track. The pool reading names the step; a profile says where its time goes.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (698 jobs, 11:10 to
12:08 UTC): the top three workflows by job-minutes (CodeQL, Security gate,
Portfolio Pages) and CI policy and Conflict markers are all `priv-*` files,
which wait for the owner. Outside those, the largest single step is
Portfolio validate's "Local workflow-runner unit tests": 8.0 job-minutes
over 35 jobs, median 17 s. The last pass on it (2026-11-03,
`ci-perf-2026-11-03-workflow-runner-yaml-memo.md`) left it at 120 tests in
3.5 s. It has since grown to 273 tests and 22 s.

`python3 -m cProfile -m unittest test_run_workflow_locally` (platform/ci),
25.3 s under the profiler, with a per-test timer:

| where | seconds |
|---|---|
| `time.sleep` from two `Handoff` tests (the fake `nap` slept 0.2 s, the child slept 5 s and 1.5 s) | 6.8 |
| `checkout_fingerprint` on this real checkout, from four sweep tests that never look at it (two readings each, 0.2-0.5 s apiece) | 3.1 |
| four `WorkflowBudget` tests waiting out a 1 s budget on `sleep 5` | 4.0 |
| everything else (real subprocesses, YAML) | ~8 |

## Change (tests only; `run_workflow_locally.py` untouched)

1. **Handoff tests.** The fake clock passes the window on the first poll, so
   the child only has to be alive then. It now waits for a file the fake nap
   writes, instead of sleeping. The note is printed while the child is
   certainly running, and the ordering assertion ("[handed off]" before
   "late line") is now guaranteed rather than timing-dependent.
2. **Budget tests.** A 0.5 s budget (`CUT`) cuts the `sleep 5` steps.
   `test_a_short_budget_still_runs_its_first_step` keeps 1 s: it pins the
   bug where a 0.99 s remainder was int-truncated to 0.
3. **Sweep tests.** `fixed_fingerprint()` stubs the checkout reading in four
   tests about labels, flushing, empty selections and common causes. The
   file already stubbed it this way at eight other `_run_selected` calls.
   The real reading keeps its own test (`CheckoutStability`).

## Verification

- Before: `Ran 273 tests in 22.026s`, OK. After: three runs, `9.869s`,
  `9.045s`, `9.200s`, all 273 OK. That is 59% less wall time. On CI the
  saving is about 7 s of a 17 s median job, roughly 4 job-minutes per 600
  runs.
- No test was dropped or weakened. Two mutants of `handoff()` were caught:
  printing the note only after the child exits, and returning 0 instead of
  the child's code (2 failures each). The source was restored with `cp`.
- 20 back-to-back runs of `Handoff` + `WorkflowBudget`: 20 OK.

## Not changed, ranked

1. The `priv-*` workflows (CodeQL 487 min, Security gate 182 min with 60%
   checkout, CI policy 88% checkout). These are owner rows (P063, P064, P086).
2. Portfolio Pages "Test the site builder", 38.5 min. It has had many passes
   (`pages-test-perf-*`).
3. The remaining ~9 s here is mostly real `git` and `bash` subprocesses:
   `ToolchainMissing` and `Execute` install tests (0.7 s each) and
   `ForChanges` diffs. Each one checks a real process boundary, so this is
   close to the floor without a different design.
