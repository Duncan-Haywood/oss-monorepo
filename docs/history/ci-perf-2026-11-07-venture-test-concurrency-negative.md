# Venture suites: capping `--test-concurrency` is slower (2026-11-07)

**Reading.** `ci_profile.py --runs 600 --top 25` (05:10 to 06:59Z): "ventures
tests" is 45.8 of 405 job-minutes, 32.1 of them in `node --test in each touched
venture`. The 2026-11-04 note ranked "match `--test-concurrency` to the pool"
first among next steps; this tests it.

**Hypothesis.** `run_venture_tests.py` runs 4 suites at once and Node's default
`--test-concurrency` is `availableParallelism()-1` (3) per suite, so up to 12
test-file processes share 4 cores. Capping each suite to 1 might cut contention.

**Measurement.** Four mid-sized suites (ebay-fee-calculator,
babysitting-business-kit, league-schedule-generator, amazon-fba-calculator)
started together on this 4-core sandbox, Node v22.23.4, wall time, all exit 0:

| setting | run 1 | run 2 |
|---|---|---|
| default | 74.3 s | 74.6 s |
| `--test-concurrency=1` | 117.3 s | 115.6 s |

**Result.** Capping is about 55% slower. Four suites with a few files each leave
cores idle at times; the default's extra processes fill those gaps. No change
made to `run_venture_tests.py`.

**Not changed, ranked for the next run.**
1. P063 (sparse checkout, 22.7 s of ~106 s per job): still the biggest ventures
   tests saving, but it edits `.github/`, so it needs the owner's approval.
2. A *higher* cap is untested (for example 2x cores); on a 4-core runner the
   expected gain is small, since CPU is already saturated in the default run.
3. "Test the site builder" (74.4 of 214.9 Pages minutes) has had many passes
   (`pages-test-perf-*`); read the latest note before touching it.
