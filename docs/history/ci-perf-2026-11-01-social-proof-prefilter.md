# check_social_proof.py: 10.7 s to 2.5 s (2026-11-01)

Perf track run. `ci_profile.py --runs 300` ranks "Check page copy for unbacked
social-proof claims" first among `Portfolio validate` steps (3.3 job-minutes
over 22 jobs). Most of the workflow's other consumers are one-second steps.

Reading: `cProfile` of `python3 platform/ci/check_social_proof.py`: 9.9 s, of
which 8.9 s is `re.Pattern.search` (707,777 calls over 6,006 files, 67 MB).
`CLAIM` has `[\d,]+` alternatives that restart at every digit run.

Change: a `maybe_claim` prefilter of plain substring tests (plus `/\s*5`) on
the lowercased file and then each line; `CLAIM` runs only on lines that pass.
Every `CLAIM` alternative contains one of the literals, so the filter is a
superset. A 20,000-line fuzz test pins that against the raw pattern.

Before: 10.7 s wall (`time`, local, whole `ventures/` tree).
After: 2.5 s. Output identical (`cmp` of both runs; 6006 files, 0 claims).
Unit tests: 15 pass.

Not changed, ranked: 1. "Router ranking-logic unit tests" (3.0 min over 22
jobs) and "Check no venture hardcodes a payment account" (2.5 min) are the
next validate steps, unprofiled; 2. the remaining 2.5 s is mostly reading and
lowercasing 67 MB, which a `git grep` prefilter could skip.
