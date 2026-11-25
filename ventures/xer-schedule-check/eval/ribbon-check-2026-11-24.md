# DCMA by WBS and activity code (ribbon.mjs), checked 2026-11-24

Command: `bash eval/corpus-fetch.sh DIR && node eval/ribbon-check.mjs DIR/xer --json eval/ribbon-check-2026-11-24.json`

The six public P6 files the other checks use (CCA hospital R03, Expressway,
the P6 20.12 example, the hotel, sample.xer, the airport terminal). Every WBS
level from 1 to 3 the file has and every flat activity code type the
project's activities carry: **58 groupings**.

| Check | Result |
|---|---|
| Each point's per-group counts add up to the project-wide count (points 1-11) | 58 of 58 groupings |
| Per-group populations add up to the project-wide population (9 and 11: never more, completed clean groups hidden) | 58 of 58 |
| Each group's pass flag recomputed from count, total and the DCMA threshold | 58 of 58 |
| Findings put in a group again by their activity ID text (successor ID for a relationship) through TASK.task_code and PROJWBS / TASKACTV directly, not through the ids ribbon.mjs uses | 34,287 of 34,287 findings per grouping (24,152 CCA, 8,141 hotel, 1,425 Expressway, 452 example, 65 airport, 52 sample); every group's count equal |

What the breakdown shows on these files (from `--ribbon`):

- **Hotel, by Responsibility:** the main contractor holds 2,311 of the 4,217
  open activities and fails 4 points; the aluminium subcontractor's 60 fail 5
  (35.9% of their links carry a lag, 21.8% of activities are over 44 days).
  The MEP subcontractor's 1,404 hold the file's one lead and are the only
  group mostly resource-loaded (5.1% unloaded against 97.6% for the main
  contractor and 100% for the others).
- **Hotel, by Bill No.:** Bill 1 has 54.9% lagged links and only 40.2%
  finish-to-start; Bill 5 passes the relationship-type point (95.2% FS).
- **CCA hospital, by CCAD DIVISION(SET):** 12,845 open activities carry no
  division; 23 Fire Protection (82) and 26 Telecom and Security (115) have
  92.7% and 98.3% of their activities on negative float, against under 0.05%
  for the unassigned bulk; the project-wide figure (point 7) hides that.
- **Expressway, by WBS:** 04 Design and Support has 100% of its 167 open
  activities without a resource and 25.7% without logic; among the
  construction groups 06 Road Works has the most unloaded work (10.8%,
  07 Structural Works 0.9%).

Points 12 to 14 (critical path test, CPLI, BEI) are properties of the
network and are not broken down. Hierarchical code types are grouped by
`--level` (level 1 is the top value) and were checked by the tests
(`ribbon.test.mjs`), not by this script's second route, which reads flat
assignments only.
