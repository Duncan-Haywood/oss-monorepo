# CI perf: the git test fixture is built once and copied (2026-11-04)

**Reading.** `python3 platform/ci/ci_profile.py --runs 100`: Portfolio validate
is the second-largest workflow (24.0 of 95.8 job-minutes, 7 jobs), spread over
dozens of 5 to 8 s unit-test steps rather than one big one. Two of the biggest:
"Privacy checker unit tests" (59 s over 7 jobs) and "Adopt-stranded-branches
tests" (50 s over 7 jobs).

**Profile.** `python3 -m cProfile -s cumulative -m unittest test_adopt_stranded`:
1557 `git` subprocesses, 865 of them from `test_unlanded_work.run`, and 4.2 s
of the 18.7 s in `setUp`. Every test of `test_unlanded_work` and
`test_adopt_stranded` re-ran the same ten git commands (init, config, clone,
three configs, add, commit, rev-parse, push) to get a bare origin plus a clone
with one commit.

**Change.** `platform/ci/test_unlanded_work.py`: `Fixture.setUp` copies a
template pair (built once per process) with `shutil.copytree` and points the
copy's `origin` at its own bare repository with one `git remote set-url`.
Tests still use real git repositories and real refs; nothing is mocked.

**Measured** (4-core sandbox, noisy; wall time of `python3 -m unittest <file>`):

| file | before | after |
|---|---|---|
| test_unlanded_work | 11.4 s | 9.1 s |
| test_adopt_stranded (3 runs each) | 19.2 to 21.8 s | 16.9 to 19.1 s |

Subprocess count for `test_adopt_stranded`: 1557 to 1233. All 37 + 37 tests pass.

**Not changed / next.** The rest of each file is test bodies that commit, push
and fetch (`squash_merge` alone is 3.1 s); batching those would change what is
tested. `platform/privacy/*.test.mjs` takes 17 s in one process for 106 tests
and has not been profiled yet. Checkout is 30% of validate's minutes and is
already the subject of earlier passes.
