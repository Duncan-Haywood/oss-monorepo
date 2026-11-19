# xer-schedule-check: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (2026-11-19, red team) levelling lower bound now integrates time-varying RSRCRATE limits (was the last row's limit: a bound a week after the levelled finish); over-limit hours in working hours, not elapsed; within-float leftovers out of the self-check; calendar times past 24:00 refused. Seeded property test in level.test.mjs. eval/level-check-2026-11-19.md not re-run (files not committed): hotel's bound 2019-02 to re-check.

- (moved 2026-11-19) risk in the written review shipped 2026-11-19 (report.mjs riskItems; eval/review-risk-check-2026-11-19.md: CCA's 18 near-critical activities all carry 15.7-18.7 d float, none in a float<10 d filter)
