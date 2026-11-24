# xer-schedule-check: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-23) Risk run levelled in every run (eval/risk-levelled-2026-11-22.md): next a commercial tool's levelled risk run to compare
- (2026-11-22) Monthly narrative (narrative.mjs): next a real scheduler's read of one written from their own update
- (2026-11-19) next: a P6-levelled XER to compare dates with, levelling in the written review (the risk run levels every run since 2026-11-22, eval/risk-levelled-2026-11-22.md)
- (2026-11-19) (8) MSPDI: next a real construction .xml (task splits read 2026-11-21, eval/split-tasks-2026-11-21.md; next one with splits from a real job)
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
- (2026-11-21) Doubled quotes: read as one reader-wide and written back doubled
  shipped 2026-11-21 (eval/quotes-2026-11-21.md). Still open: a P6 Web export
  with a quote in a single-line value, to see whether P6 Web doubles it too.
- (2026-11-21) Project XML out: the 4 in-progress CCA late dates traced
  2026-11-22 (eval/msproject-latedates-2026-11-22.md: P6 rolls a
  zero-duration activity's late start up from a running assignment, Project
  does not; 19,822/19,822, converter warns). Still open there: a P6 Resource
  Usage export of such an activity. Activity codes as Text2..Text30
  shipped 2026-11-21 (eval/msproject-codes-2026-11-21.md). Activity UDFs
  as Number/Cost/Date/Text fields shipped 2026-11-21
  (eval/msproject-udfs-2026-11-21.md; P6 has no yes/no UDF, so no Flag
  fields). Resource UDFs as resource fields shipped 2026-11-21
  (eval/rsrc-udfs-2026-11-21.md, both directions). WBS UDFs on the summary
  tasks shipped 2026-11-21 (eval/wbs-udfs-2026-11-21.md, both directions,
  planted: no public XER has one; next: a real file with WBS UDFs);
  the Date UDF start/finish subtype kept through Finish1..10 shipped
  2026-11-22 (eval/finish-udfs-2026-11-22.md); activity codes as outline codes shipped 2026-11-21 (opt-in
  `--outline-codes`, eval/msproject-outline-2026-11-21.md; next: open one in
  Microsoft Project to settle the default and which task form it wants); the 8 CCA code types past 29 fields. MSPDI to XER for P6 import
  shipped 2026-11-21 (p6xer.mjs, eval/p6xer-check-2026-11-21.md).
- (2026-11-21) Project XML to XER: next, an import into a real P6 (any
  version) to confirm what the field lists stand in for (notes as TASKMEMO
  under MEMOTYPE shipped 2026-11-21, eval/notebooks-2026-11-21.md: check
  whether P6's import matches a topic by name or adds one); deadlines as finish-on-or-before constraints shipped
  2026-11-21 (opt-in `--deadlines`, primary or secondary by P6's rules; the
  MSPDI reading now caps late finish at a deadline as Project's slack does;
  eval/deadlines-2026-11-21.md; next: a real Project file with open tasks
  and deadlines, a P6 import of a secondary from an XER). Cost resources and fixed costs as
  PROJCOST expenses shipped 2026-11-21 (eval/expenses-2026-11-21.md, both
  directions); still open there: a P6-written XER with expenses, whether
  P6's import matches a cost category by name, expense accounts (acct_id).
  Number/Cost/Date fields as UDFs shipped 2026-11-21
  (eval/p6xer-udfs-2026-11-21.md). The UDF type on a round trip shipped
  2026-11-22 as types from the original XER (--types-from; CCA 13,174 of
  13,174 keep P6's type, eval/udf-types-from-2026-11-22.md); text UDFs back
  as text UDFs, not codes, 2026-11-22 (28,850 values, eval/udf-type-hints-2026-11-22.md). Still open
  there: a Project file with no XER behind it keeps "whole numbers as
  integer"; a marker inside the Project file needs a Project seat to check
  that it survives a save. Finish-date UDFs and Project's Start/Finish fields
  shipped 2026-11-22 (eval/finish-udfs-2026-11-22.md); interim plans in
  those fields named, and left out with --no-interim, 2026-11-22
  (eval/interim-plans-2026-11-22.md: 354/354 planted, 0 false alarms on 143
  files). Still open there: a real Project file with Set Baseline > Interim
  plan run, to see what Project writes for the fields' definitions.
  Resource custom fields as RSRC UDFs shipped 2026-11-21
  (eval/rsrc-udfs-2026-11-21.md).
- (2026-11-21) constraints log's "past late start" now says whether a row moves anything (eval/constraints-slack-2026-11-20.md: 65/65)
- (2026-11-21) its forward gap searched 2026-11-20, no rule (one link; eval/relationship-dates-2026-11-20.md)
- (2026-11-21) relationship dates (TASKPRED aref/arls) decoded 2026-11-20 (reldates.mjs, eval/relationship-dates-2026-11-20.md: arls 40,476/40,476; lags changed after the run read back, 1,200/1,200 planted): the 5-node SS chain is P6 contradicting its own arls (closed), the 608 h lag was not edited
- (2026-11-21) next a real P6 import
- (2026-11-21) Notebooks: P6 notebooks <-> Project task notes shipped
  2026-11-21 (notebook.mjs, eval/notebooks-2026-11-21.md). Still open: a
  real P6 Web export with a multi-line plain-text memo (do 0x7F breaks show
  as lines in P6, as read here, or as spaces, as MPXJ reads them?); project
  notebooks (PROJMEMO, if a P6 export carries one); P6's formatting as Project's rich
  notes (needs the .mpp, not MSPDI).
- (2026-11-21) next a real P6 import, P6 Web plain multi-line memos
- (2026-11-21) Resource notes (RSRC.rsrc_notes <-> resource Notes) shipped
  2026-11-21 (eval/resource-notes-2026-11-21.md: 241/241 planted, 17/17
  Project notes, MPXJ agrees). Still open: a public P6 file with resource
  notes that hold text (the six have only empty editor shells). Unassigned
  resources shipped 2026-11-21 (opt-in `--all-resources`,
  eval/all-resources-2026-11-21.md: 890/890 Project resources and 17/17 notes
  back). P6's resource hierarchy as Project's resource Group shipped
  2026-11-22 (eval/resource-hierarchy-2026-11-22.md: 502/502 parent paths
  back). Still open there: whether a Project file that came from an XER
  (p6xer.mjs) should turn the option on by itself (it would keep rebuilt
  parents' names); a P6 import of the parent resources.
- (2026-11-21) Resource curves: spread by P6's curves in earned value shipped
  2026-11-21 (curves.mjs, eval/resource-curves-2026-11-21.md). Still open: a
  P6 export with a curved, cost-loaded assignment and P6's Resource Usage
  numbers to check the slice reading against; how P6 re-fits a curve to the
  remaining units of a started assignment (spread evenly here); curves in the
  risk run (levelling on curves shipped 2026-11-22, opt-in `--curves`,
  eval/level-curves-2026-11-22.md; next: a P6-levelled export with a curved
  assignment to settle whether P6's leveller reads curves, and so the default); Project XML out shipped 2026-11-22 as timephased
  work rows (eval/curves-to-project-2026-11-22.md; next: open one in Project,
  started curved assignments, a curved cost per day); what curve id 9, named
  in three files and exported in none, is.
- (2026-11-22) UDF types from the original XER 2026-11-22 (--types-from; CCA 13,174/13,174 typed, was 7,104; eval/udf-types-from-2026-11-22.md), text UDFs back as text UDFs not codes (28,850 values, eval/udf-type-hints-2026-11-22.md)
- (2026-11-22) next an open in desktop Excel
- (2026-11-23) next a real branch register
- (2026-11-23) Progress review (progress.mjs, eval/progress-review-2026-11-23.md): still open: activity steps (TASKPROC: physical % from step weights when PROJECT.step_complete_flag is on; 0 TASKPROC rows in 21 public files, so it waits for one); the flags new this month in the update comparison and the written review; a guide page ("how to check percent complete in a P6 update"); a real owner's reviewer's list to set the thresholds.
- (2026-11-24) next an Acumen Fuse count on one file, a P6 import of the cleaned XER. (20) Calendar review 2026-11-23 (calreview.mjs, eval/calendar-review-2026-11-23.md)
