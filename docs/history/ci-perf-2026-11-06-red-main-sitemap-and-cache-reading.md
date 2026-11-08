# Perf pass 2026-11-06: red `test` job on main (sitemap), and a cache reading

## Reading

`ci_profile.py --runs 600 --top 25` (2026-11-06 21:09 to 23:06 UTC): 594 jobs,
431 job-minutes; Portfolio Pages 219 min, of which "Test the site builder" is
82 min. Ventures tests 58 min, Conflict markers 30 min.

One PR run read in full (run 42308621178, job `test`): checkout 25 s, restore
share cards 7 s (a real archive download, so the cache restores), site-builder
tests 150 s and **red**: `venture-sitemap-coverage.test.mjs` found
wall-framing-takeoff's `floor-`, `foundation-` and `nail-calculator.html`
absent from its `sitemap.xml`. `main` (4b9785fdd) had the same gap, so every
PR's `test` job failed at the end of a 150 s run and skipped the dashboard
tests behind it.

## Change

Added the three `<url>` lines to `ventures/wall-framing-takeoff/sitemap.xml`.
`node --test venture-sitemap-coverage.test.mjs`: 3 pass, 0 fail (was 1 fail).

## Why this is perf

A red `test` job wastes its whole 150 s on every PR head until fixed, and
each failed run draws a re-run. No test was weakened.

## Not changed (ranked)

1. Earlier item still open: build `site()` and `hubFixtureSite()` concurrently
   (see `pages-test-perf-2026-11-06-reading-top-two-tests.md`).
2. The log tail did not show whether the restore was an exact or a restore-key
   hit; read the "Cache restored from key" line next time before touching it.
3. A pre-commit or `--for-changes` hook running the sitemap test when a venture
   gains an `.html` page would catch this in seconds, not at 150 s.
