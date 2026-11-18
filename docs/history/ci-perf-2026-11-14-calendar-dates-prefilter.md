# CI perf, 2026-11-14: calendar-date lint prefilter, concurrency-tax commits in one fast-import

Two items from the previous run's "not changed" list
(`ci-perf-2026-11-14-hub-content-memo.md`, item 2). Both files run in every
PR's `unwired_checks` pass inside "ventures tests" and in local session gates.

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --steps 30` (2026-11-14 18:18Z
to 18:37Z): 268 jobs, 232.4 job-minutes, checkout 89.8. "ventures tests" /
"node --test in each touched venture" 12.6 min over 9 jobs (81 s median); the
two Pages steps above it have had many passes already. P063 and P064 are still
owner-gated (workflow files).

## 1. `check_calendar_dates.py`: 3.5 s to 0.4 s

**Profile.** `python3 -m cProfile -s tottime platform/ci/check_calendar_dates.py`:
4.27 s total, of which 3.16 s in 2,052,578 `re.Pattern.search` calls. The
scanner ran up to six regexes on every line of the 5,704 `.js/.mjs/.cjs/.ts`
files under `ventures/` and `platform/`.

**Change.** Literal prefilters, exact by construction: `NAN_CHECK` cannot
match a line without the text `isNaN(`, and `DAY_RANGE` cannot match one
without ` <= 31`. A file lacking both is skipped whole; inside a candidate
file, a line lacking the literal skips that branch. The `if/elif` order and
every regex are unchanged.

**Verification.** `scan_text` old vs new on all 25,660 tracked
`.js/.mjs/.cjs/.ts/.html/.py` files in the repository (including test files
and trees the lint does not scan): identical line lists on every file, 6 hits
on both. `scan()` over `ventures/` + `platform/`, three runs each, same
container: old 3.58 / 3.40 / 3.56 s, new 0.39 / 0.51 / 0.38 s, 0 hits both.
`python3 -m unittest test_check_calendar_dates`: 6 pass, 3.44 s before,
0.46 s after (the tree-clean test was nearly all of it).

## 2. `test_concurrency_tax.py`: 9.0 s to 3.1 s

**Profile.** Per-test timing (`unittest` one test at a time): the template
build (first test to call `make_repo`, 4.6 s) and
`test_own_commit_cap_is_inclusive` (3.1 s) were 7.7 of 9.0 s. Both build a
chain of 50 or 51 empty commits with two `git` processes per commit
(`commit` + `rev-parse`), on top of the 2026-11-09 template fix.

**Change.** `empty_commits(repo, branch, parent, messages)` writes the same
chain in one `git fast-import` process: same parent, same messages (with the
trailing newline `git commit -m` adds), each commit keeping its parent's tree.
Still a real repository; nothing mocked.

**Verification.** In the built fixture: `rev-list --count pr7` = 52 (base + 51),
`pr7^{tree}` equals the base tree, last message `import 50\n`, `git status`
clean, `git fsck --strict` clean. Mutation: building 50 imports instead of 51
fails 3 tests (PR 7 is no longer over the cap), so the fixture still pins the
boundary. `python3 -m unittest test_concurrency_tax`: 19 pass, 9.04 s wall
before, 3.19 s after.

## Not changed, ranked for the next run

1. **`platform/ci/test_run_workflow_locally.py`** (9.2 s, every Portfolio
   validate job): 176 tests, no single lever (previous run's note).
2. **`glen`** in `platform/distribution/hub/content.mjs`, still the top self
   time in `content.test.mjs` (previous run's item 1).
3. `check_calendar_dates.py`'s remaining 0.4 s is the sorted `rglob` walk;
   `os.walk` with `SKIP_PARTS` pruned would save a little more but must keep
   the same sort order. Not worth it alone.
4. Other git-fixture tests that commit in a loop: `grep -n "for i in range" platform/ci/test_*.py`
   next to a `commit(` call is the pattern; `fast-import` applies when the
   commits are empty or add files in a known order.
5. P063 and P064 remain owner-gated (workflow files).
