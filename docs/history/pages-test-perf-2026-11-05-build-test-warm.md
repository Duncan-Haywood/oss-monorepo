# Pages tests: build.test.mjs warm reading (2026-11-05)

Follow-up to `pages-test-perf-2026-11-05-determinism-warm.md`, item 1 of its
"Not changed" list: re-measure `build.test.mjs` warm, since the 298 s in
backlog P062 was a cold figure.

- Command: `PAGES_CARD_CACHE=<dir> node --test build.test.mjs` in
  `platform/pages`, 4-core sandbox, run back to back.
- Cold card cache: 439.3 s (`duration_ms` 439305), 304 of 304 pass.
- Warm card cache (second run): 266.5 s (`duration_ms` 266493), 304 of 304 pass.
- The cold figure here is above P062's 298 s because the sandbox was busier;
  the warm/cold ratio (0.61) is the useful number.

No code changed. A warm `build.test.mjs` is still the longest Pages test file
(266 s against determinism's 85 s), so it sets the floor on the job.

## Not changed (ranked for the next run)

1. Profile where the warm 266 s goes inside `build.test.mjs` (`node --cpu-prof`
   per test); 304 tests, so look for a few tests holding most of the time.
2. Compare `ci_profile.py` "Test the site builder" minutes once the CI
   card-cache hit rate is known (26.0 job-min over 47 jobs in the
   2026-11-05 reading).
