# Pages suite: one existence check per path (2026-11-25)

Perf track, version 0. `platform/pages/build.test.mjs` is still the
site-builder suite's long pole; this pass takes about 10 s out of its serial
test phase without changing what any test asserts.

## Reading (before)

Pool (`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-25
20:26Z to 21:17Z): 715 jobs, 991.5 job-minutes, checkout 357.6. Largest
consumers: CodeQL 333.5 min, Security gate 175.4, Portfolio Pages 165.1
(heaviest step "Test the site builder", 55.5 min). All three perf backlog items
(P063, P064, P086) are owner-gated, so the target is the suite itself, not a
workflow.

For-profit suites checked first and flat: `einvoice-preflight` 275 files,
29.9 s wall at 2 jobs, slowest file 1.5 s; `ai-bookkeeper` 351 files, 35.5 s
wall at 4 jobs, slowest 4.3 s (`suite_file_times.py <slug>`). Both are node
start-up per file, nothing to take.

`suite_file_times.py platform/pages --jobs 1 --timeout 300`: `build.test.mjs`
over 300 s, `custom-domain.test.mjs` 30.1 s, every other file under 9 s.

`node --test --test-reporter=tap build.test.mjs` (4-core container, no card
cache): 337 pass, 297 s wall. Per-test `duration_ms`, slowest:

| test | ms |
|---|---:|
| 4 `no test payload ...` (first to await the shared build and its child) | 229,837 |
| 283 `... exception footer on its share card` | 11,021 |
| 10 `relative links inside each tool resolve` | 8,175 |
| 6 `no page still points at the placeholder origin` | 7,476 |
| 228 `changing the worker itself changes the cache name` | 6,602 |
| 219 `a category's offline bundle stays small ...` | 5,535 |
| 250 `every stylesheet and script ... is one file` | 3,131 |
| 116 `every injected link resolves to a page that exists` | 3,013 |
| 211 `the worker and manifest resolve from a page at any depth` | 2,083 |

## Where test 10's time went

Against a kept copy of the build (39,106 files), the test's loop made
**149,248 `fs.access` calls, one at a time, for 7,542 distinct paths**. Timed
alone: sequential access 5.1 s, the same checks memoised per path 0.33 s.
Reading the pages was 1.3 s and the regexes 0.5 s. Tests 116 and 211 do the
same thing on a smaller scale (one stat per injected link, one access per
worker/manifest/icon reference on every page).

Test 6 was also measured: 5.3 s of its 7.5 s is the first read of every text
file, which `readText` memoises for the tests after it, and `new URL` on
328,557 matches is 0.7 s. Nothing to take there.

## Change

`exists(target)` in `build.test.mjs` is memoised per path under the shared
build, the same rule `readText` and `walk` already follow (the shared build is
read-only once `site()` resolves; every other path is checked fresh). Tests
10, 116 and 211 call `exists` instead of their own `fs.access`/`fs.stat`.
`fs.stat` and `fs.access` answer the same existence question here. No
assertion, message or input changed.

## Verification

Same command, same container, same (cold) card state:

| | before | after |
|---|---:|---:|
| test 10 | 8,175 ms | 2,056 ms |
| test 116 | 3,013 ms | 663 ms |
| test 211 | 2,083 ms | 436 ms |
| three together | 13.3 s | 3.2 s |
| `build.test.mjs` wall | 297.2 s | 289.7 s |
| tests | 337 pass | 337 pass |

The wall number carries the build phase's noise (test 4 was 229.8 s before and
234.5 s after, the same build); the per-test numbers are the clean measure.
These tests run after the shared build resolves, in series, so the 10 s comes
straight off the suite's long pole.

## Not changed, ranked for the next run

1. **Test 283 (11 s)** renders about 200 share cards at 55 ms each: for every
   exception tool both the exception-footer card (compared byte for byte with
   the built one) and the default-footer card (to show the two differ). Each
   render checks different bytes, so cutting them narrows the test. Spreading
   them over worker threads would keep the claim; not worth it for 11 s yet.
2. **Test 228 (6.6 s)** re-reads the whole build into `offlineFileDigests`
   once by design (the purity check needs an independent read).
3. **The warm full build** is still flat (56 s standalone with a warm card
   cache): `finishPagesInOneWalk` 9.0 s, `writeSection` 6.5 s,
   `addOfflineSupport` 4.6 s, `shareTagsFor` 4.1 s inclusive; `writeFileUtf8`
   7.1 s and GC 4.7 s self. The `<meta ...>` regex is 1.2 s self; the
   largest single regex left.
4. **Test 4 is the build**: the shared build and the determinism child run in
   parallel, about 230 s cold-cards in this container. The child is the one
   full build the determinism claim needs.
