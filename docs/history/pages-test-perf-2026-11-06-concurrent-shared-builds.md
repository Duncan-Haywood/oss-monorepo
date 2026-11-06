# Pages tests: building the two shared fixtures concurrently does not help (2026-11-06)

Perf track; no code change shipped. Tests item 2 of "Not changed" in
`pages-test-perf-2026-11-06-reading-top-two-tests.md`.

## Change tried

In `platform/pages/build.test.mjs`, call `void site(); void hubFixtureSite();`
at module load so the real-site build (132 s) and the hub-fixture build (55 s)
overlap instead of the second starting when its first test runs.

## Measurement

4-core sandbox, empty `PAGES_CARD_CACHE` (a fresh directory), `node --test
build.test.mjs`, 305 tests, 305 pass.

| | wall | user |
|---|---:|---:|
| before (reading, same machine) | 268.1 s | not taken |
| concurrent builds | 285.3 s (4m45s) | 514 s |

Wall time went up about 6%. Each build already runs a worker pool across all
four cores, so overlapping them only splits the same CPU. The change was
reverted.

## Not changed (ranked)

1. A real CI `share-cards` cache hit (90 s cold against 47 s warm for a site
   build). The workflow restores `test-share-cards-*` with fallbacks already;
   read a run log's `cache-hit` output before touching the builder.
2. Anything that cuts the fixed per-build work (font rasterising, the card
   pool) helps both builds; overlap cannot.
3. A runner with more than 4 vCPU would make overlap pay; not available on the
   free plan.
