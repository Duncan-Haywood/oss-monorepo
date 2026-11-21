# xer-schedule-check: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-19) next: a P6-levelled XER to compare dates with, levelling in the written review and the risk run
- (2026-11-19) (8) MSPDI: next a real construction .xml, task splits
- (2026-11-19) next a second P6 file using them, a risk-page switch to sample them
- (2026-11-19) next: a real file with range UDFs, probabilistic branches
- (2026-11-19) next: a public XER with P6's own float_path values to check path order against, the review section for an interim milestone

- Calendar slack, the mirror: shipped 2026-11-20 as the milestone-calendars
  check (milestones.mjs, eval/milestone-calendars-2026-11-20.md: the hotel
  file's 8 hand-over milestones on the Friday-off calendar hold 11 successors
  1-9 h; 2,001 of 2,001 float gains sound and tight). The "past late start"
  flag read against them shipped 2026-11-20 (eval/constraints-slack-2026-11-20.md).
  Still open: a milestones-on-24h switch for the written
  review and the risk run; a real P6 file rescheduled with the milestones
  moved, to check the dates against P6's own.
- Constraints log: a real site's log.
- (2026-11-20) next a real reviewer's reading
- (2026-11-20) appendix 2026-11-19
- (2026-11-20) next progress override, start float and 24-hour lag paths on a real P6 file
- (2026-11-20) (3) GitHub ERMHDR search, size-split 2026-11-19: a seventh P6 file (Harbour Pointe 17.12) 113/113 once 8 durations edited after its last run are put back
- (2026-11-20) next a real site's log
- (2026-11-21) next a real series of updates to check the split and drivers against (windows in the review shipped 2026-11-19)
- (2026-11-21) next a real baseline and update pair, a P6 layout export to check value order ties
- (2026-11-21) XER reader: P6 writes a `"` inside an unquoted field as `""`
  (CCA file, 10 names); `parseXer` keeps the doubled quote, MPXJ reads one.
  `msproject.mjs` undoes it for the names it writes; a reader-wide fix needs
  `xerText` to write `""` back and the comparison/report outputs checked.
- (2026-11-21) Project XML out: 4 in-progress CCA activities differ in late
  dates only after the round trip (eval/msproject-check-2026-11-21.md); Resume
  and at-completion duration ruled out. Activity codes as Text2..Text30
  shipped 2026-11-21 (eval/msproject-codes-2026-11-21.md). Activity UDFs
  as Number/Cost/Date/Text fields shipped 2026-11-21
  (eval/msproject-udfs-2026-11-21.md; P6 has no yes/no UDF, so no Flag
  fields). Resource UDFs as resource fields shipped 2026-11-21
  (eval/rsrc-udfs-2026-11-21.md, both directions). WBS UDFs on the summary
  tasks shipped 2026-11-21 (eval/wbs-udfs-2026-11-21.md, both directions,
  planted: no public XER has one; next: a real file with WBS UDFs);
  keep the Date UDF start/finish subtype on the way back; activity codes as outline codes shipped 2026-11-21 (opt-in
  `--outline-codes`, eval/msproject-outline-2026-11-21.md; next: open one in
  Microsoft Project to settle the default and which task form it wants); the 8 CCA code types past 29 fields. MSPDI to XER for P6 import
  shipped 2026-11-21 (p6xer.mjs, eval/p6xer-check-2026-11-21.md).
- (2026-11-21) Project XML to XER: next, an import into a real P6 (any
  version) to confirm what the field lists stand in for; notes as TASKMEMO
  (needs MEMOTYPE); deadlines as a secondary finish-on-or-before constraint
  (opt-in, since it changes float); cost resources as PROJCOST expenses.
  Number/Cost/Date fields as UDFs shipped 2026-11-21
  (eval/p6xer-udfs-2026-11-21.md). Still open there: the UDF type on a round
  trip (whole numbers come back as integer UDFs, so 6 of CCA's decimal UDFs
  change type, 7,104 of 13,174 values keep P6's; a hint that survives a save
  in Project is needed), finish-date UDFs (Project has one date kind).
  Resource custom fields as RSRC UDFs shipped 2026-11-21
  (eval/rsrc-udfs-2026-11-21.md).
- (2026-11-21) constraints log's "past late start" now says whether a row moves anything (eval/constraints-slack-2026-11-20.md: 65/65)
- (2026-11-21) its forward gap searched 2026-11-20, no rule (one link; eval/relationship-dates-2026-11-20.md)
- (2026-11-21) relationship dates (TASKPRED aref/arls) decoded 2026-11-20 (reldates.mjs, eval/relationship-dates-2026-11-20.md: arls 40,476/40,476; lags changed after the run read back, 1,200/1,200 planted): the 5-node SS chain is P6 contradicting its own arls (closed), the 608 h lag was not edited
- (2026-11-21) next a real P6 import
