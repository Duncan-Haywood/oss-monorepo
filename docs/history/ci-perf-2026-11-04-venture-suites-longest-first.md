# Venture test runner: longest suite first (2026-11-04)

**Reading.** `ci_profile.py --runs 300 --top 12` (50 min of runs ending
2026-11-04T11:14Z): "ventures tests" is 52.1 of 265 job-minutes, 43.9 of them
in `node --test in each touched venture` (16 jobs, about 2.7 min each), the
second-largest step after Pages' "Test the site builder" (several passes
already, see the other `pages-test-perf-*` notes).

**Finding.** `platform/ci/run_venture_tests.py` submitted suites to its
worker pool in alphabetical order. Suite length varies by about 300x
(15-suite sample, 4 workers, this sandbox: most suites 1-5 s, einvoice-preflight
20.5 s, shed-designer 307 s). When a PR touches several ventures, a large
suite whose name sorts late starts after the small ones and runs alone at the
end; started first, it overlaps them.

**Change.** Submit suites by test-file bytes, largest first (ties by name).
Same suites, same results, same exit code; only start order changes. Unit test
`test_the_biggest_suite_starts_first` pins the order.

**Verification.** `python3 -m unittest test_run_venture_tests` (8 pass). The
sample run above passes except shed-designer's two browser-driven tests, which
time out in this sandbox (pre-existing, unrelated: no change touches them).

**Not measured.** The wall-time saving needs a runner: bound by
(sum of other suites)/(workers) at most, only on PRs touching a heavy venture
plus others. Check `ci_profile.py` "node --test in each touched venture"
minutes per job against the 2.7 baseline after a few days.

**Ranked next.** 1. Run `node --test` with `--test-concurrency` matched to the
pool so file-level and venture-level parallelism do not oversubscribe 4 cores.
2. P062 remaining option (warm re-measure of build.test.mjs).
