# Venture runner: read the workflows once, not once per venture (2026-11-12)

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
workflows and wait for the owner, so the run took step 2 and 3 of the prompt.

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --steps 30` (runs
2026-11-12T06:34Z to 06:56Z, 239 job-minutes): after the two steps already
worked many times ("Test the site builder", "node --test in each touched
venture"), the next single step was **"Runner unit tests"** in
`ventures-tests.yml`: 3.6 job-minutes over 10 runs, median 24 s, for 18 unit
tests of `platform/ci/run_venture_tests.py`.

Locally (`python3 -m unittest test_run_venture_tests`, this container): 25.3 s.
Timed per test, one is 19.9 s of it:
`Selection.test_an_all_zero_base_means_every_venture`, which calls `main()`
twice over every venture (1,348).

## Profile

`cProfile` on one `main(["--since", "0"*40])` with `has_tests` mocked, as the
test does: 28.0 s, of it 26.0 s in `skip_note` -> `python_run_elsewhere` ->
`test_commands`, called 172,544 times (1,348 ventures x 128 workflows), each
reading a workflow file and running the step regex over every line (14 million
`re.match` calls). `python_run_elsewhere` was cached per venture, but each
venture still re-read and re-scanned every workflow.

The same path runs in production whenever every venture is asked about: a full
run with no slugs (`has_tests` per venture) and a push that creates a branch
(`--since` forty zeros). Before any suite started, that was 14 to 26 s of
workflow parsing.

## Change (`platform/ci/run_venture_tests.py`)

- `_workflow_steps(WORKFLOWS)` (cached per directory) reads each workflow once
  and keeps only its pytest/unittest steps, as (command, the lines around it),
  with the same regexes and the same pip/uv exclusion as before.
- `test_commands(slug, wf, steps)` filters those steps per venture: all of
  them for the venture's own `<slug>-*.yml`, otherwise the ones whose nearby
  `working-directory` is the venture (same regex, after a plain substring
  prefilter it implies).
- `clear_workflow_caches()` clears both caches; the tests that rewrite a
  workflow between calls use it instead of `python_run_elsewhere.cache_clear()`.

## Verification

- **Same answers.** A scratch script dumped, for all 1,348 ventures,
  `python_run_elsewhere`, `has_tests` and `skip_note` as sorted JSON and
  hashed it: `547707ef86386aa9` before and after (47 ventures with Python run
  by another workflow, 1,341 with a suite here). Its wall time: 14.4 s before,
  **0.69 s** after.
- `python3 -m unittest test_run_venture_tests`: **25.3 s to 6.3 s**, 18/18
  passing (two runs after, 6.30 s and 6.27 s).

## Not changed, ranked for the next run

1. The rest of the 6.3 s: `test_a_hung_suite_is_killed_and_named` (2.0 s, a
   deliberate timeout) and the all-zero test's two `inherited_keys` scans of
   every venture (about 1.2 s each, real lint work a full run does too).
2. "Portfolio validate" is 54 job-minutes with no step over 1.7 min: about 40
   unittest steps of 4 to 6 s each, mostly interpreter start and checkout.
   Merging steps would need a workflow edit (owner-gated).
3. P063 and P064 remain owner-gated.
