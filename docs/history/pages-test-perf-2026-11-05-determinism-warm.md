# Pages tests: build-determinism warm reading (2026-11-05)

Backlog P062 asked for a warm re-measure of `build-determinism.test.mjs`
before touching it.

- Command: `PAGES_CARD_CACHE=<dir> node --test build-determinism.test.mjs`,
  4-core sandbox, run twice in a row.
- Cold card cache: 261.9 s (the 292 s in P062 was also cold).
- Warm card cache (second run): 85.2 s. Both tests pass.

The file runs two child-process builds side by side, so its warm time is one
build under 2x contention, not two sequential builds. CI sets
`PAGES_CARD_CACHE`, so the cold figure in P062 overstates the cost.

## Not changed (ranked for the next run)

1. Re-measure `build.test.mjs` warm the same way; it is the longest file and
   the figure in P062 (298 s) is cold.
2. Compare `ci_profile.py` "Test the site builder" minutes after the
   card-cache hit rate on CI is known; that is the metric that matters.
3. Nothing in determinism's own code is worth changing: 85 s runs beside
   `build.test.mjs`, which is longer, so it is off the critical path.
