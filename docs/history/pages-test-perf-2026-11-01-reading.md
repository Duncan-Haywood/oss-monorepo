# Pages test perf, reading, 2026-11-01

Reading only; no code changed in this run.

## Pool reading

`python3 platform/ci/ci_profile.py --runs 200 --top 12` (189 jobs, 182.8
job-minutes): "Test the site builder" in Portfolio Pages is the largest single
step, 24.1 job-minutes over 30 jobs (about 48 s each, 13% of the pool).

## Per-file timing (cloud container, `PAGES_CARD_CACHE=/tmp/cc`, cold, one file per `node --test`)

| file | seconds |
|---|---|
| build.test.mjs | >300 (hit my timeout) |
| custom-domain.test.mjs | 61.9 |
| faq-coverage.test.mjs | 7.6 |
| surface-budget.test.mjs | 7.5 |
| clauses / siblings | 5.2 each |

A second run of `build.test.mjs` with the cache now partly warm still exceeded
280 s, so the container is much slower than a CI runner here and the timings
are not comparable with the 48 s CI median.

## Next step

Per-test timing inside `build.test.mjs` (spec reporter, run in the background
with a 20-minute timeout) to see which `buildSite` calls dominate, then fold
repeated builds that share inputs into one. Not done here: the run ended
before a trustworthy number existed.
