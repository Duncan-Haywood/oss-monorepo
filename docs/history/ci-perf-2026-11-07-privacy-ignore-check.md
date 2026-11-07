# Perf: the privacy checkers' usage-module walk (2026-11-07)

**Reading.** `ci_profile.py --runs 600`: "Privacy checker unit tests" is the
heaviest step of Portfolio validate (47 jobs, 3.8 job-minutes). The site-builder
tests are larger but have had a dozen passes (see the pages-test-perf notes).

**Profile.** `findUsageModules()` (platform/privacy/browser-signals.mjs) took
1.43 s per call; the directory walk itself is 77 ms. The rest is one
`git check-ignore --stdin` over 1313 paths (1.36 s on its own; `git ls-files`
over the same tree: 12 ms). The five suites call it ~15 times per process.

**Change.** Tracked files are exempt from `check-ignore` anyway, so one
`git ls-files -z -- <root>` finds them, and only untracked paths go to
`check-ignore`. If `ls-files` fails (tmpdir fixtures outside the repo) nothing
counts as tracked and the old path runs unchanged.

**Verification.** `findUsageModules()` output byte-identical before and after
(`cmp`, 1313 paths). Walk 1432 ms -> ~150 ms. `node --test
platform/privacy/*.test.mjs`: 10.5 s -> 7.5 s wall, 106/106 pass (local, one
machine, single runs).

**Not changed, ranked.** (1) one-opt-out/inline-signals still re-walk per
test; a per-process memo is unsafe because browser-signals.test.mjs makes
scratch ventures under ventures/. (2) Portfolio Pages "Test the site builder"
remains the largest consumer (69 job-minutes).
