# Pages tests: the per-file timings were cold-cache (2026-11-04), backlog P062 part 2

Perf run. P062 asked to share one build between `custom-domain.test.mjs` and
`build.test.mjs`. Reading first:

- They cannot share: `custom-domain` builds a two-venture fixture with
  `baseUrl` = a custom apex, `build.test` builds the real tree at
  `https://example.test/site/`. Different inputs, different assertions.
- The 120 s figure came from a run without `PAGES_CARD_CACHE`. The CPU profile
  (`node --cpu-prof`) of that run is 62% `(idle)`: the main thread waiting on
  the share-card worker pool (see `pages-build-perf-2026-11-01-card-pool-idle.md`).
  `portfolio-pages.yml` sets `PAGES_CARD_CACHE` for the test step and restores
  a daily cache.

Measured, 4-core sandbox, `node --test platform/pages/custom-domain.test.mjs`:
no cache 78 s (and 120 s in the per-file reading); `PAGES_CARD_CACHE` set, first
run (fills it) 65.8 s; second run (warm, what CI sees) 28.0 s.

So the per-file reading overstated the CI cost of the three build files.
No code changed. The P062 item is corrected (effect 2 to 1, part 2 dropped).

Not changed / next: re-take `build.test.mjs` and `build-determinism.test.mjs`
warm before assuming they are 298 s and 292 s on a runner; then judge with
`ci_profile.py` "Test the site builder" minutes (baseline 17.5 over 21 jobs).
