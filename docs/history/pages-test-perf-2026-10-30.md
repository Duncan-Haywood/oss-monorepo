# Pages builder tests: the kill-switch build (2026-10-30)

Item 1 of "Not changed, ranked" in `pages-test-perf-2026-10-24.md`.

## Reading

`ci_profile.py --runs 100` (14 minutes of runs, 2026-10-30): Portfolio Pages
is 50.1 of 122.5 job-minutes, and its heaviest step is "Test the site
builder" (33.8 job-minutes over 15 jobs, about 2.3 min each).

## Change

`build.test.mjs`, "the worker can be withdrawn from devices that already have
it", built the whole site with `disableWorker: true` only to read `sw.js`. It
now calls `addOfflineSupport({ disableWorker: true })` over a one-page
directory (plus empty files for the shared assets `addOfflineSupport` reads
for size labels). The kill-switch worker is rendered from no site data, so
the assertions (unregister, caches.delete, no `BUNDLE`) read the same bytes.

## Verification

- Before: that one test, run alone, did not finish inside 120 s (it builds
  the site first); the 10-24 note measured the build at about 80 s.
- After: the same test alone takes 1.1 s wall clock and passes.
- Full suite after the change: 1344 pass, 0 fail, 548 s wall clock on a loaded session container (not a clean before/after: no unchanged-suite run was timed). The saving is the second full site build, about 80 s of CPU per CI job by the 10-24 measurement.

## Not changed, still ranked

1. The /compare/ and /guides/ fixture builds draw ~1,228 research and
   writing cards; a `buildSite` option for an empty root would skip them.
2. `custom-domain.test.mjs` builds in its own process (off the critical path).
3. P049: jobs per PR head.
