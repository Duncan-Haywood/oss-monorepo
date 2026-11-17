# Pages tests, 2026-11-13: the cache-name test reads the site twice, not three times

Perf track. Takes item 2 of "Not changed" in
[`pages-test-perf-2026-11-12-shared-walk-memo.md`](pages-test-perf-2026-11-12-shared-walk-memo.md):
`changing the worker itself changes the cache name` hashed every file of the
shared build once per name it computed, three names, three full reads of the
site. Both open perf backlog items (P063, P064) touch workflow files and still
wait for the owner.

## Pool reading

`python3 platform/ci/ci_profile.py --runs 300 --top 20` (2026-11-13 18:20Z to
18:39Z): 282 jobs, 287.1 job-minutes, checkout 83.5. Portfolio Pages is still
the largest workflow (94.7 min, 37 jobs); "Test the site builder" its heaviest
step (52.2 min; `--steps 25` gives a 296 s median over 12 runs).

## Reading, local

`node --test --test-reporter=tap build.test.mjs` in `platform/pages`, 4 cores,
`PAGES_CARD_CACHE` in the session scratchpad, per-test `duration_ms` summed.

| run | wall | build-waiting test | other 311 tests | cache-name test |
|---|---:|---:|---:|---:|
| before (cold card cache, first run) | 289 s | 242.5 s | 43.5 s | 7.1 s |
| after (warm card cache) | 102 s | 58.7 s | 41.3 s | **4.9 s** |

The two walls are not comparable: the first run drew every share card. The
build-waiting test carries that; the cache-name test does not touch cards, so
its 7.1 to 4.9 s (-31%) is the change. 312 of 312 pass in both runs.

The test was 18.7 s in the 11-12 reading; the sync-read change in
[`pages-build-perf-2026-11-12-cache-name-sync-reads.md`](pages-build-perf-2026-11-12-cache-name-sync-reads.md)
had already cut each read to about 2.3 s, so a third of the test was what was
left to take.

## Change

`platform/pages/build.mjs`: the per-file loop moved out of
`offlineCacheName` into an exported `offlineFileDigests(outDir)` (sorted
[relative path, sha256] pairs). `offlineCacheName(outDir, codeVersion,
digests)` hashes `codeVersion` then the pairs, as before; with no `digests`
(the build never passes one) it reads the tree itself. The hash sees the same
`update` calls in the same order.

`platform/pages/build.test.mjs`: the first name is computed the way the build
computes it; `offlineFileDigests` reads the site a second time, and the second
and third names reuse those digests. `edited === again` still compares two
independent reads (the purity check) and now also pins the `digests` path to
the build's path. No assertion was removed.

## Verification

- Old and new `offlineCacheName` over the whole `ventures/` tree, with and
  without a `codeVersion`: identical names (`portfolio-99d6298625a0`,
  `portfolio-de969e0ff82d`), via a throwaway copy of the old module.
- `build.test.mjs`: 312 pass, 0 fail, after the change.

## Not changed, ranked for the next run

1. **The shared build is the step.** Warm, it is 58.7 s of 102 s here; on a
   cold card cache it is 242 s. Whether CI's 296 s median is mostly cold card
   drawing is worth a check (`Restore the share cards` cache-hit rate per job)
   before another micro-change to the tests.
2. The share-card exception footer test (7.8 s) renders each exception's card
   twice and every category card once; that rendering is what it checks, so it
   is not a cheap cut.
3. `relative links inside each tool resolve` (5.3 s), regex-bound.
4. P063 and P064 remain owner-gated (workflow files).
