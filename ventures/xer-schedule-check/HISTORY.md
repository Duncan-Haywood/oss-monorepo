# xer-schedule-check: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (2026-11-19, red team) levelling lower bound now integrates time-varying RSRCRATE limits (was the last row's limit: a bound a week after the levelled finish); over-limit hours in working hours, not elapsed; within-float leftovers out of the self-check; calendar times past 24:00 refused. Seeded property test in level.test.mjs. eval/level-check-2026-11-19.md not re-run (files not committed): hotel's bound 2019-02 to re-check.

- (moved 2026-11-19) risk in the written review shipped 2026-11-19 (report.mjs riskItems; eval/review-risk-check-2026-11-19.md: CCA's 18 near-critical activities all carry 15.7-18.7 d float, none in a float<10 d filter)
- (moved 2026-11-19) (8) Microsoft Project XML read 2026-11-19 (mspdi.mjs; 2,406 of 2,491 tasks = Project's dates on 102 files, eval/cpm-vs-project-2026-11-19.md)
- (moved 2026-11-19) (7) expected finish dates shipped 2026-11-19 (cpm.mjs rule + finding; eval/expected-finish-2026-11-19.md: 21 of 21 durations, 404 of 404 with 80 h planted)
- (moved 2026-11-19) (5) Monte Carlo risk and risk register shipped 2026-11-19 (risk.mjs; eval/risk-check-, eval/risk-register-check-2026-11-19.md)
- (moved 2026-11-19) (6) resource levelling shipped 2026-11-19 (level.mjs, --level: serial pass by early start, the file's priority list, crew-size what-if; eval/level-check-2026-11-19.md: 0 h over a limit from placed work on six files, 37,670 of 37,670 links hold, x1e6 limits = CPM)
- (moved 2026-11-20) UDF ranges shipped 2026-11-19 (eval/udf-ranges-check-*)
