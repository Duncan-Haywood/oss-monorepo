# CI perf, 2026-11-09 (later): pool reading, still checkout-bound

Perf track reading; no code change. Follows
`ci-perf-2026-11-09-pool-reading-no-new-lever.md`.

`python3 platform/ci/ci_profile.py --runs 200 --top 12`, 199 jobs in 20
workflows, 2026-11-09 10:08Z to 10:43Z: 170.9 job-minutes, 44.5 of them
checkout (26%), 5.3 setup/teardown.

| workflow | jobs | min | median s | checkout share |
|---|---|---|---|---|
| Portfolio Pages | 40 | 74.8 | 98 | 16% |
| Portfolio validate | 15 | 35.1 | 171 | 14% |
| ventures tests | 12 | 19.0 | 42 | 25% |
| Conflict markers | 20 | 9.0 | 32 | 73% |

`--runs 120 --steps 15`: "Test the site builder" is 19.8 job-minutes over 5
jobs (245 s median), the largest single step by a factor of 2.4. Its time is
two lazily shared builds inside `build.test.mjs`
(`pages-test-perf-2026-11-06-reading-top-two-tests.md`), already attacked by
eleven earlier passes.

## Looked at, not changed

1. **P063 (ventures-tests sparse checkout)** and every small guard's checkout
   (73% of their time): all edits to `.github/workflows/`, CODEOWNERS-gated.
2. **Portfolio validate** (171 s median) is one long serial job of about 40
   small steps, none above 6 s. Splitting it would shorten wall time but not
   job-minutes, and it edits a gated workflow.
3. **P064**: the search now runs in worker threads (24.9 s to 13.8 s); only the
   stamp cache remains, and it is gated.

Conclusion: nothing left to move that is not in a CODEOWNERS path. The owner
can unblock about 25 job-minutes per 35 minutes of pool time by approving a
small workflow-only PR (sparse checkout for the four guards plus P063).
