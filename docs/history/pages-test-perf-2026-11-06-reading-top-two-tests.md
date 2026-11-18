# Pages tests: where the 268 s of build.test.mjs goes (2026-11-06)

Perf track reading; no code change. Follows
`pages-test-perf-2026-11-06-build-test-warm-and-red-catch-all.md`.

## Pool reading

`ci_profile.py --runs 100 --top 15` (2026-11-06 03:19 to 04:07 UTC): 109.6
job-minutes, Portfolio Pages 50.0 of them, and "Test the site builder" the
heaviest step at 17.1 job-minutes over 28 jobs.

## Per-test reading

`node --test --test-reporter=spec build.test.mjs`, 4-core sandbox, empty
`PAGES_CARD_CACHE`: 305 tests, 305 pass, 268.1 s. The ten slowest tests:

| ms | test |
|---:|---|
| 132 700 | no test payload, CLI source, or repo bookkeeping is published |
| 55 010 | the built site publishes /compare/, links it, and lists it in the sitemap |
| 12 460 | changing the worker itself changes the cache name |
| 9 583 | every stylesheet and script this build injects is one file, at the right depth |
| 6 070 | a documented external-call exception gets the exception footer on its share card |
| 6 048 | relative links inside each tool resolve |
| 3 682 | every injected link resolves to a page that exists |
| 3 587 | a category's offline bundle stays small enough to fetch on mobile data |
| 3 088 | no page still points at the placeholder origin |
| 2 522 | the worker and manifest resolve from a page at any depth |

The first two are not slow assertions. Each is the first caller of a lazily
shared build (`site()` and `hubFixtureSite()`), so it pays the build for the
other ~300 tests. Together they are 70% of the file's wall time.

## Full build, directly

`node build.mjs --out=<dir>`, same machine, same cache dir, back to back:
90.5 s wall / 195 s user, then 47.6 s wall / 35 s user. The user-time gap
(195 s against 35 s) says the first run was still drawing share cards that the
second read from the cache, so the cache was not fully warm after the test
run (the test fixture builds use different inputs from the real site).
The two outputs (1015 MB, 17 042 files) match byte for byte except
`version.json`, which carries a build timestamp.

## Not changed (ranked)

1. A real CI cache hit on `share-cards-*` is the lever: 90 s cold against 47 s
   warm for the site build alone. Check the cache hit rate in a run log before
   touching the builder again.
2. `site()` and `hubFixtureSite()` could build concurrently (the hub fixture
   is independent of the real-site build), turning 132 s + 55 s serial into
   about the longer of the two when cores allow. The CI runner has 4 vCPU and
   the build is already worker-parallel, so measure on a runner first.
3. 1015 MB of output for the real site is large for a test fixture; a
   test-only build that skips the card pool would cut most of the user time,
   but those tests assert on cards, so that would weaken them. Left alone.
