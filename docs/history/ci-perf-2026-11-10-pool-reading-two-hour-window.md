# CI perf, 2026-11-10: second pool reading of the day, no new lever

Perf track. `python3 platform/ci/ci_profile.py --runs 600 --top 25` (55 s wall):
609 jobs in 19 workflows, 06:58Z to 09:00Z, 482.5 job-minutes, 138.2 of them
checkout (29%) and 15.9 setup/teardown.

| workflow | jobs | job-min | checkout % | heaviest step |
|---|---:|---:|---:|---|
| Portfolio Pages | 129 | 219.0 | 16 | Test the site builder (98.2 min) |
| ventures tests | 25 | 68.2 | 13 | node --test per touched venture (55.6 min) |
| Portfolio validate | 58 | 64.6 | 29 | Install dependencies (2.0 min) |
| Conflict markers | 61 | 28.4 | 75 | Guard unit tests (1.7 min) |
| Portfolio Pages site build | 25 | 19.8 | 44 | Upload the built site (3.3 min) |

Against the 00:58Z reading the same morning (`ci-perf-2026-11-10-pool-and-page-weight-reading.md`)
the checkout share fell from 48% to 29% and the site-builder tests are again the
largest step, now 0.76 min per job on average.

## Not changed

Every lever left is either owner-gated (P063 sparse checkout, guard-workflow
checkouts: `.github/workflows/`) or already worked in the series
(site-builder test warm builds, gallery search threads, card cache). P064 stays
open: its workflow edit is owner-gated and a stamp cache is still the remaining saving.
Nothing was weakened or skipped, and no code changed.

Ranked for the next run: (1) P063/P064 once the owner applies them;
(2) confirm the `share-cards-*` cache hit rate in a run log before touching the
builder; (3) `guides/index.html` (210 kB gzip) only with an SEO argument.
