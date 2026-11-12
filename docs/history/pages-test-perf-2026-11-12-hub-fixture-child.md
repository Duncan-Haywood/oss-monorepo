# Pages tests: the hub fixture builds in a child, beside the shared build (2026-11-12)

Perf track. Takes item 1 of "Not changed" in
[`pages-test-perf-2026-11-11-determinism-one-child.md`](pages-test-perf-2026-11-11-determinism-one-child.md):
measure the sequential tail of `build.test.mjs` per test before deciding what
to change.

## Reading

Pool reading first (`python3 platform/ci/ci_profile.py --runs 600 --top 15`,
2026-11-12 01:23Z to 02:19Z): 581 jobs, 524.4 job-minutes, checkout 158.5.
Portfolio Pages is still the largest workflow (228.4 min over 115 jobs), and
"Test the site builder" is still its heaviest step (116.2 min). Both open perf
backlog items (P063, P064) touch workflow files, so they wait for the owner.

Per-test durations in `build.test.mjs` alone, from
`node --test --test-reporter=tap build.test.mjs` (each test's `duration_ms`,
summed and sorted), with a cold share-card cache (363 s wall):

| test | s |
|---|---:|
| no test payload, CLI source, or repo bookkeeping is published (the first to await the shared build) | 189.5 |
| **the built site publishes /compare/, links it, and lists it in the sitemap** | **81.1** |
| changing the worker itself changes the cache name | 12.8 |
| every stylesheet and script this build injects is one file, at the right depth | 12.2 |
| the next 20 (whole-site page walks, about 2 to 6 s each) | about 50 |
| the other 286 | under 1 each |

The second line is the finding. That test is the first to call
`hubFixtureSite()`, which ran a full `buildSite` of a two-venture fixture **in
this process, after the shared build had finished**. `buildSite` keeps
per-build state at module level, so it could not run in-process beside the
shared build. The 2026-11-11 run's guess about the tail was wrong: the tail is
not 300 small tests, it is one hidden build.

## Change

`hubFixtureSite()` now writes the same fixture tree, then builds it in a child
process (`node --input-type=module -e ...`, the same pattern as `childSite()`).
The child prints `{ comparisons }`, the one part of the result the tests read.
`site()` starts it next to the determinism child, so it runs from the first
test while the shared build runs. The fixture, its options
(`disableWorker: true`, `https://example.test/`, silent log) and both tests'
assertions are unchanged. A build that throws still rejects the memoised
promise, and both tests fail on it as before. A side benefit: the fixture
build's module-level state (`SITE_COUNTER_URL` and the rest) no longer lands
in the process the other 300 tests run in.

## Measurement

4-core sandbox, Node 22.23. Share-card cache warmed by one full run first (as
CI's restored `test-share-cards-*` cache would be). The CI command,
`PAGES_CARD_CACHE=<dir> node --test --test-reporter=tap "*.test.mjs" "cloudflare/*.test.mjs"`
in `platform/pages`, bash `time`, before and after in turns by copying the two
versions of the file:

| run | wall | user | sys | pass / fail | /compare/ test | shared-build wait |
|---|---:|---:|---:|---|---:|---:|
| after 1 | 180.9 s | 299.0 s | 85.4 s | 1554 / 0 | 0.004 s | 86.6 s |
| before 1 | 206.2 s | 300.1 s | 86.0 s | 1554 / 0 | 30.8 s | 80.8 s |
| after 2 | 179.5 s | 293.5 s | 87.9 s | 1554 / 0 | 0.003 s | 88.4 s |
| before 2 | 201.0 s | 289.8 s | 83.4 s | 1554 / 0 | 32.2 s | 76.6 s |
| **mean after** | **180.2 s** | 296.3 s | 86.7 s | | | 87.5 s |
| **mean before** | **203.6 s** | 295.0 s | 84.7 s | | | 78.7 s |

**Result: wall time 203.6 s to 180.2 s (−23.4 s, −11.5%), same CPU, same
1554 passing tests.** The fixture build's 31 s left the tail. It cost about
9 s of contention on the shared build, which now shares four cores with two
children. On CI the step is a VM of its own, so this saving should show
directly in "Test the site builder" (116.2 min over the window; the
2026-11-11 median was 282 s). Re-read with `ci_profile.py --steps` after a day
of merges.

## Not changed, ranked for the next run

1. **The shared build is now the whole step.** About 87 s warm of the 180 s,
   and its wait grows when children share the cores. The step can only go
   faster now by making `buildSite` itself cheaper. Profile it with
   `node --cpu-prof` on a warm cache.
2. **The whole-site page walks.** About 20 tests each re-walk the output and
   re-read every HTML page (2 to 6 s each, about 50 s together, cold). One
   memoised `[{ rel, html }]` list shared by all of them would cut most of
   that. Each walk has its own filter (`allPages`, `listFiles`, `walk`,
   `everyToolPage`), so check that each test's page set stays the same.
3. `changing the worker itself changes the cache name` (12.8 s) hashes the
   whole site twice for two names. One `offlineCacheName` call with a memo of
   the per-file hashes would halve it.
4. P063 and P064 remain owner-gated (workflow files).
