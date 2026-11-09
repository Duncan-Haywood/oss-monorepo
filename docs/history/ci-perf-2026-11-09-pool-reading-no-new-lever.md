# CI perf, 2026-11-09: pool reading, no new lever

Reading: `python3 platform/ci/ci_profile.py --runs 300 --top 12`, 319 jobs in 18
workflows, 2026-11-09 01:08Z to 02:11Z, 235.7 job-minutes, 69.1 of them checkout
(29%) and 8.3 setup/teardown.

| workflow | jobs | min | median s | checkout share |
|---|---|---|---|---|
| Portfolio Pages | 65 | 128.9 | 111 | 14% |
| ventures tests | 20 | 29.6 | 40 | 21% |
| Portfolio Pages site build | 22 | 14.8 | 46 | 44% |
| Conflict markers | 28 | 12.2 | 31 | 74% |
| Portfolio validate | 28 | 12.0 | 30 | 72% |
| einvoice-preflight CI | 24 | 9.9 | 28 | 74% |

Heaviest step: "Test the site builder", 52.3 job-minutes (about 48 s per job),
already cut by the pages-test-perf passes of 2026-10-24 to 2026-11-06.

## Looked at, not changed

1. **P063 (ventures-tests sparse checkout, about 22.7 s per job).** Still the
   best lever for the checkout share, but it edits `.github/workflows/`, which
   CODEOWNERS holds for the owner. Still open; it needs its own small PR.
2. **Portfolio validate "Install dependencies" (1.1 min over 28 jobs).** A
   pip cache was already judged to cost about what it saves
   (`ci-perf-2026-11-06-profile-reading-and-seo-title.md`). Not reopened.
3. **P064 (gallery search stamp).** Landed 2026-11-08
   (`ci-perf-2026-11-08-gallery-search-stamp.md`); the backlog row is stale.

For the next run: the pool is now checkout-bound (74% in the three small
guards). Cheaper per-job checkouts (sparse, blob-filtered) across the small
guard workflows is the one remaining pool-wide lever, and all of it is in
CODEOWNERS paths.
