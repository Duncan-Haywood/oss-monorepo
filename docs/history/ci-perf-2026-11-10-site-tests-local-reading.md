# CI perf, 2026-11-10: site-builder tests, local cold reading, no new lever

Perf track. Pool reading (`ci_profile.py --runs 200`, 10:13Z to 11:02Z): 202
jobs, 121.3 job-minutes, checkout 50.8 (42%); Portfolio Pages is the largest
workflow (53.8 min) and "Test the site builder" its largest step (20.8 min).
Same ranking as the two earlier readings today.

Local cold run of `node --test "*.test.mjs" "cloudflare/*.test.mjs"` in
`platform/pages` on 4 cores, no card cache: 1500 tests, 1499 pass (one skipped),
7 m 10 s wall, 18 m 55 s user CPU.

Per-test wall time (spec reporter): four tests take 62 s to 281 s each
(`build-determinism` cache name, `build.test.mjs` "no test payload...",
`custom-domain` default origin, the `/compare/` page). They are not slow in
themselves: each awaits a shared full site build, so the number is queueing
behind concurrent builds on 4 cores. The next tests are 14 s and under.

Conclusion: the step is CPU-bound in the builds the series already
memoised (`pages-test-perf-2026-11-06-concurrent-shared-builds.md`). Reducing
it further needs fewer distinct full builds, not faster tests. No code
changed; nothing skipped or weakened.

## Not changed, ranked for the next run

1. Count the distinct `buildSite` configurations across the test files; any two
   that differ only in an assertion-irrelevant option can share one build.
2. P063 and P064 remain owner-gated (workflow files).
3. Checkout is 42% of pool minutes in this window; guard workflows are
   owner-gated.
