# CI pool reading, 2026-11-10 15:13 UTC

Taken with `python3 platform/ci/ci_profile.py --runs 100 --top 12`
(91 jobs, 15 workflows, 15:03 to 15:12 UTC, 42.1 job-minutes).

| Measure | Value |
|---|---|
| Checkout | 22.9 of 42.1 job-minutes (54%) |
| Setup/teardown | 2.1 |
| Largest workflow | Portfolio Pages, 11.2 min, 10 jobs (27% checkout) |
| Heaviest single step | Test the site builder, 5.0 min |
| Queue time q50 / q90 | 3 / 3 s (pool not starved) |

## Reading

- No queueing: the concurrent-job ceiling was not binding in this window.
- Checkout share is 78% in Conflict markers and Research, 74% in Portfolio
  validate. These are the same checkout-bound jobs listed in
  `ci-perf-2026-11-09-pool-reading-checkout-bound.md`; their workflow files
  are in `.github/CODEOWNERS`, so the lever (sparse checkout) waits for the
  owner (backlog P063, P064).
- "Test the site builder" has had a dozen passes
  (`pages-test-perf-2026-11-0*.md`); no new lever found from this reading.

## Not changed (ranked)

1. P063: ventures-tests full checkout (owner-gated).
2. P064: gallery search stamp cache per Pages job (owner-gated).
3. Site-builder tests, 5.0 min: warm caches already applied.

No code changed; this note is a reading only, and no new lever was found.
