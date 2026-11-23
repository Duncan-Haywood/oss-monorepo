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
- (2026-11-20) free float: an activity with an expected finish has none (cpm.mjs ffExpected; eval/free-float-expected-2026-11-20.md: 23 of 23 store 0 in the 24.12 file, 72 of 72 without one store the gap); free float 19,820 of 19,822
- (moved 2026-11-20) (4) written review shipped 2026-11-19 (report.mjs, print to PDF; eval/review-report-2026-11-19.md: 2-11 ranked corrections on six real files)
- (moved 2026-11-20) constraints log shipped 2026-11-20 (eval/constraints-check-2026-11-20.md)
- (moved 2026-11-20) its hotel residual traced to calendar slack, shipped 2026-11-20 (calslack.mjs, --calendar-slack, page panel; eval/calendar-slack-2026-11-20.md: 188 activities gain 1-17 h, 188/188 hold and tight)
- (moved 2026-11-20) EV by window shipped 2026-11-20 (evmseries.mjs, --windows --earned-value, windows panel; earned vs the last update's promise; eval/evm-series-check-2026-11-20.md: 435/435 planted slips, 250/250 overruns)
- (moved 2026-11-20) edited-durations list shipped (eval/edited-durations-2026-11-19.md: 300/300 planted)
- (moved 2026-11-20) windows analysis across many updates shipped 2026-11-19 (windows.mjs, --windows; a not-started re-estimate is now a revision in the half-step; eval/windows-check-2026-11-19.md)
- (moved 2026-11-21) grouped by activity code 2026-11-21 (actvcodes.mjs, --group-by; 1,239,716 of 1,239,716 placements, eval/activity-codes-2026-11-21.md)
- (moved 2026-11-21) (2) update comparison shipped 2026-11-19 (compare.mjs, half-step split; eval/compare-check-2026-11-19.md: 720 of 720 planted edits on six real files)
- (2026-11-21, red team) Project XML to XER: repeated resource IDs (Project's first-letter Initials; 55 of 143 MPXJ corpus files, 798 repeats) made unique with -2, -3 and named by p6Problems; summary-task assignments now reported. eval/p6xer-check-2026-11-21.md "Correction"; eval/p6xer-resource-ids.mjs.
- (moved 2026-11-21) Number/Cost/Date fields as P6 UDFs 2026-11-21 (243/243, round trip 13,997/13,997, MPXJ agrees; eval/p6xer-udfs-2026-11-21.md)
- (2026-11-21) XER reader: P6's doubled quotes (`""` inside an unquoted value; every inner quote in P6 6.0, 7.0 and 20.12 exports) read as one in every value, and `xerText` writes them back doubled; `msproject.mjs`'s own unescape dropped. 22,260 of 22,260 names = MPXJ's (11 wrong before), 448,834 of 448,835 rows written back byte for byte, CPM 19,820 of 19,822 unchanged (eval/quotes-2026-11-21.md).
- (moved 2026-11-21) WBS UDFs on summary tasks 2026-11-21 (6,383/6,383 planted back, MPXJ agrees; eval/wbs-udfs-2026-11-21.md)
- (moved 2026-11-21) resource UDFs as resource fields 2026-11-21 (330/330 through XML and back, MPXJ agrees; eval/rsrc-udfs-2026-11-21.md)
- (moved 2026-11-21) UDFs as Number/Cost/Date/Text fields 2026-11-21 (42,971/42,971 back, MPXJ agrees; eval/msproject-udfs-2026-11-21.md)
- (moved 2026-11-21) activity codes as Text2-30 2026-11-21 (276,042/276,042 back, MPXJ agrees; eval/msproject-codes-2026-11-21.md)
- (moved 2026-11-21) outline codes 2026-11-21 (eval/msproject-outline-2026-11-21.md)
- (moved 2026-11-21) P6 resource curves 2026-11-21 (curves.mjs, eval/resource-curves-2026-11-21.md)
- (moved 2026-11-22) fifth pass 2026-11-19 (rule 17, unspent FS/FF lag of a finished node: its late dates 1,529 of 1,534)
- (moved 2026-11-21) resource notes 2026-11-21 (241/241 planted; eval/resource-notes-2026-11-21.md)
- (moved 2026-11-22) P6 resource curves as Project timephased work 2026-11-22 (curveRows; hospital file 33/33 within 0.0003 h a day, MPXJ 66/66; eval/curves-to-project-2026-11-22.md)
- (moved 2026-11-22) unassigned resources 2026-11-21 (--all-resources, 17/17 notes back)
- (moved 2026-11-22) resource tree as Group 2026-11-22 (502/502)
- (moved 2026-11-22) work contours as P6 curves of Project's measured shape 2026-11-21 (19/19 within 0.035 h, eval/work-contours-2026-11-21.md)
- (moved 2026-11-22) (1) CPM fourth pass shipped 2026-11-19 (rules 12-16: 19,820 of 19,822, late finish 19,822; eval/cpm-vs-p6-2026-11-19.md); (7) longest path and multiple float paths shipped 2026-11-19 (floatpaths.mjs, --float-paths, page panel; eval/longest-path-2026-11-19.md: P6's flag 261/261 on five files)
- (moved 2026-11-22) (9) look-ahead shipped 2026-11-19 (lookahead.mjs, --lookahead, page panel; eval/lookahead-check-2026-11-19.md: 6,476 of 6,479 windowed activities = P6's); milestone calendars shipped 2026-11-20 (milestones.mjs; eval/milestone-calendars-2026-11-20.md)
- (moved 2026-11-22) (12) Gantt chart shipped 2026-11-20 (LOE and WBS summary dates = P6's on 305 of 305, eval/gantt-check-2026-11-20.md)
- (moved 2026-11-22) MSPDI to XER shipped 2026-11-21 (eval/p6xer-check-2026-11-21.md); deadlines in float and XER (eval/deadlines-2026-11-21.md)
- (moved 2026-11-22) Notebooks <-> task notes 2026-11-21 (88/88 real, 2,006/2,006 planted; eval/notebooks-2026-11-21.md)
- (moved 2026-11-22) interim plans named, --no-interim 2026-11-22 (eval/interim-plans-2026-11-22.md: 354/354 planted)
- (moved 2026-11-22) late dates 19,822/19,822 2026-11-22 (eval/msproject-latedates-2026-11-22.md)
- (moved 2026-11-22) P6 curves out as Project timephased work 2026-11-22 (eval/curves-to-project-2026-11-22.md)
- (moved 2026-11-22) Contractor's monthly narrative 2026-11-22 (narrative.mjs, --narrative, page; causes as fill-ins; eval/narrative-check-2026-11-22.md)
- (moved 2026-11-23) health trend across updates 2026-11-22 (trend.mjs, --trend; BEI vs first update, float erosion with cause; eval/trend-check-2026-11-22.md)
- (moved 2026-11-23) Probabilistic branches in the risk run 2026-11-22 (--branches, page, review; eval/branches-2026-11-22.md: 113/113 planted)
- (moved 2026-11-23) SS/FF/SF oracle 2026-11-22 (2 faults fixed, eval/crash-oracle-links-2026-11-22.md)
- (moved 2026-11-23) Risk run levelled in every run 2026-11-22 (--levelled; crew-limit delay on common draws; eval/risk-levelled-2026-11-22.md); next a commercial tool's levelled risk run to compare
