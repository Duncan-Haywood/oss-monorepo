# Local workflow-runner tests: parse each workflow once (2026-11-03)

Perf track. `ci_profile.py --runs 600`: Portfolio validate is 94 job-minutes
over 45 jobs; its largest step, "Local workflow-runner unit tests", is 5.3
minutes (7 s a job). Portfolio Pages' "Test the site builder" (78 min) has had
many passes (`pages-build-perf-2026-11-02-warm-profile.md`); its floor is the
one shared build.

## Reading

`python3 -m cProfile -s cumulative -m unittest test_run_workflow_locally`
(platform/ci): 16.3 s under the profiler, 13.4 s of it in
`load_workflow` -> `yaml.safe_load`, called 907 times on the same ~dozens of
workflow files.

## Change

`load_workflow` memoises the parse keyed by the file's text (an edited file is
re-read) and returns a deep copy, so callers that mutate the result are safe.

## Verification

Before: `Ran 120 tests in 8.160s` (wall 8.3 s). After: `Ran 120 tests in
3.472s` (wall 3.6 s). Same 120 tests, 1 skipped, OK. No test weakened.

## Not changed, ranked

1. "Every tool stays callable from the agent CLI" (4.0 min / 45 jobs).
2. Portfolio validate has ~30 steps of 2-3 s each, mostly interpreter start;
   merging them into one runner would save more but renames steps.
3. `yaml.CSafeLoader` would speed the remaining parses; not needed now.
