# babysitting-business-kit: the browser tests run side by side (2026-11-16)

**Where.** Perf track, "the slowest local step an agent session waits on". Both
open perf backlog items (P063, P064) touch CODEOWNERS paths and wait for the
owner, so this run took a venture suite instead. Test-file bytes ranked the
candidates; the eight largest suites without a perf note were timed with
`node --test *.test.mjs` (wall clock, this 4-core sandbox):
babysitting-business-kit 6.6 s, sales-agent 3.2 s, ebay-fee-calculator 1.0 s,
the other five under 0.8 s.

**Profile.** Per-file timing put 4.9 s of babysitting-business-kit's 6.6 s in
`e2e.test.mjs`, the Playwright file (next: packages.test.mjs at 0.9 s). Its spec
reporter showed seven tests that ran one after another: the two full
lead-to-payment flows (1.2 s and 1.3 s), the service-worker offline test
(0.6 s), the keyboard test (0.4 s) and three guide pages (0.2 s each). The
browser and the server are already shared; the time was the sum of
independent tests that each open their own `browser.newContext()`, so they
share no storage, cookies, service workers or offline state.

**Change.** Wrap the tests in `describe("in the browser", { concurrency: true })`.
Same seven tests, same assertions, same skip when Playwright or Chromium is
missing (CI's venture runner skips the file, as before).

**Numbers** (`node --test e2e.test.mjs`, five runs each, wall clock):

| | runs (ms) | median |
|---|---|---|
| before | 4838, 4825, 4926, 4926, 5067 | 4.93 s |
| after | 3002, 2891, 2882, 3093, 2936 | 2.94 s |

The whole suite (`node --test *.test.mjs`) went from 6.6 s to 4.8 s, 333 of 333 tests
passing; `python3 platform/ci/run_venture_tests.py babysitting-business-kit`
reports ok in 5.1 s.

**Verification.** 15 back-to-back runs of the file after the change: 0
failures. With the keyboard test's focus-ring assertion flipped to a wrong
value, the run reports 6 pass, 1 fail, so a failure inside the concurrent
block still fails the file. No CI time changes: the file skips on runners.

**Not changed, ranked for the next run.**
1. sales-agent (3.2 s): not profiled yet.
2. packages.test.mjs here (0.9 s): the next largest file, not profiled.
3. The two full flows still each take about 1.3 s; they are now the floor of
   the file. Splitting them would weaken the "survives a reload" check, so leave them.

## Also: the site build hit EMFILE in this sandbox

`run_workflow_locally.py --for-changes` failed portfolio-pages "Build the site"
with `EMFILE` in `moveAudioToCdn` (`platform/pages/audio-cdn.mjs`): one
`Promise.all` read all 21,546 text files in `dist/` at once, and this sandbox
allows 20,000 open descriptors (`ulimit -n`). GitHub runners allow 65,536, so
CI was still green, but every agent session that builds the site locally failed.
It failed on `main` too, since this PR did not touch that code. The rewrite now holds
at most 64 files open (same files, same rewrite, same order of results).
`audio-cdn.test.mjs` 4/4 pass; the rerun of `--for-changes` reports 9/9
selected workflows passed, portfolio-pages 12/12 run steps.
