# Pages tests, 2026-11-12: one walk and one read per file of the shared build

Perf track. Takes item 2 of "Not changed" in
[`pages-test-perf-2026-11-12-hub-fixture-child.md`](pages-test-perf-2026-11-12-hub-fixture-child.md):
about twenty tests in `platform/pages/build.test.mjs` each re-walked the
shared build's output and re-read every HTML page. Both open perf backlog
items (P063, P064) touch workflow files and still wait for the owner.

## Reading

Per-test `duration_ms` from `node --test --test-reporter=tap build.test.mjs`,
summed. The first test to await the shared build carries the build itself
(about 253 s here, the child determinism build and the hub fixture building
beside it on 4 cores), so the comparison that isolates this change is the sum
of the other 310 tests.

Before (the file at `8afb3d281`, warm share-card cache): wall 382.6 s, the
build-waiting test 253.2 s, the other 310 tests **126.5 s**. The page-walk
tests were 2.8 to 4.8 s each, the same cost each time: a fresh recursive
`readdir` of 25k files and a fresh `readFile` of all 4,471 pages (97 MB).

## Change

The shared build is read-only once `site()` resolves: no test writes into it
(every test that needs a writable tree makes its own `mkdtemp`; checked by
grepping every `writeFile`, `mkdir`, `rm`, `cp` and the build-pass calls that
take an `outDir`). So:

- `readText(file)` replaces the file's 51 `fs.readFile(x, 'utf8')` calls. For
  a path under the shared build it memoises the read promise per file;
  anything else (temp dirs, the hub fixture, `ventures/`) reads fresh exactly
  as before.
- `walk`, `allPages`, `htmlPagesUnder` and the imported `listFiles` are
  wrapped in `memoWalker`, which memoises per directory under the shared build
  and hands every caller its own copy of the list (one test sorts its list).
  Recursion calls the uncached walker, so the memo holds one entry per
  directory a test asked for, not one per subdirectory.
- `sharedOutDir` is set when the shared build resolves; before that nothing
  is memoised.

No assertion, filter or test was changed.

## After

Same command, same machine, run right after: wall **313.9 s**, the
build-waiting test 252.8 s, the other 310 tests **58.5 s** (126.5 s before,
-54%). 311 of 311 pass in both runs. Peak RSS of the test process (Python
`RUSAGE_CHILDREN.ru_maxrss`): 1,682 MB before, 1,661 MB after, so holding the
pages in memory did not raise the peak; the build is the peak.

| test | before s | after s |
|---|---:|---:|
| every stylesheet and script this build injects is one file, at the right depth | 15.6 | 1.6 |
| every injected link resolves to a page that exists | 6.0 | 2.1 |
| the worker and manifest resolve from a page at any depth | 4.8 | 1.3 |
| every page the site serves is listed in some sitemap | 4.1 | 0.8 |
| every published page links the favicon | 3.6 | 1.0 |
| eleven more whole-site page walks | 2.8 to 3.4 each | 0.0 to 0.2 each |

A first, cold before run (fresh share-card cache) had the build test at
281.5 s and the other 310 at 122.9 s; it agrees.

## Not changed, ranked for the next run

1. **The shared build is now about 80% of the step** (253 of 314 s). Only a
   cheaper `buildSite` moves it now: profile it with `node --cpu-prof` on a
   warm cache, with the child build and hub fixture off to get a clean
   profile.
2. `changing the worker itself changes the cache name` (18.7 s) hashes the
   whole site twice for two names; a memo of per-file hashes inside the test
   would halve it.
3. The share-card exception footer test (7.5 s) and `relative links inside
   each tool resolve` (6.4 s, now regex-bound, not I/O-bound).
4. P063 and P064 remain owner-gated (workflow files).
