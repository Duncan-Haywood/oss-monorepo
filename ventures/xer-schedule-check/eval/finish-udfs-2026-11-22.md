# Start and finish custom fields between P6 and Microsoft Project, 2026-11-22

**Question.** P6 has two kinds of date user-defined field (UDF): start dates
(`FT_START_DATE`) and finish dates (`FT_END_DATE`). Microsoft Project has three
sets of custom date fields: Date1..10, Start1..10 and Finish1..10. Until today
`msproject.mjs` wrote both P6 kinds to Date fields, so a finish-date UDF came
back from Project XML as a start-date UDF (named in `eval/p6xer-udfs-2026-11-21.md`
and `NEXT.md`). And `mspdi.mjs` / `p6xer.mjs` did not read Start or Finish
custom fields at all, so a Project user's Start1..10 and Finish1..10 values
were dropped on the way to P6 with no warning. Can both be fixed, and do the
field IDs match what Project itself writes?

## What changed

- `msproject.mjs`: finish-date UDFs (activity, WBS, resource) go to Finish1..10;
  start-date UDFs stay in Date1..10. More than ten finish-date UDFs spill into
  the Date fields start dates leave free, with a warning that they come back
  as start dates. Field IDs: task Start1..10 and Finish1..10 at MPXJ 16.10's
  `MPPTaskField` indexes (52/53 ... 64/65, 282/283 ... 290/291 on base
  0x0B400000), resource ones at `MPPResourceField` indexes (102-106, 220-224;
  107-111, 190-194 on base 0x0C400000).
- `mspdi.mjs` reads task Start1..10 as start-date UDFs and Finish1..10 as
  finish-date UDFs (activity and WBS); `p6xer.mjs` the same for resource
  fields, and its warning says which field set became which kind.
- `eval/p6xer-check.mjs` no longer maps P6's `FT_END_DATE` to `FT_START_DATE`
  before comparing types, so "with the type" now means P6's own type.

## Data

- MPXJ's `junit/data/generated/task-starts` and `task-finishes` (github.com/joniles/mpxj,
  sparse clone 2026-11-22, read for measurement, not copied here): 12 Project
  XML files saved by Microsoft Project 2003, 2007, 2010, 2013, 2016 and 2019,
  one task per field, named after it (task "Finish7" sets Finish7). Project's
  own `ExtendedAttribute` definitions in them give the FieldID of every Start
  and Finish field: all 20 equal the IDs above.
- CCA_R03_dt_24Oct11SC.xer (P6 6.0, `eval/cpm-vs-p6-2026-11-19.md`): two
  finish-date UDFs, `user_end_date3` (103 values) and `user_end_date4` (79).
  Expressway has none; the other four public files have no activity UDFs.

## Results

`node eval/finish-udfs.mjs --mpxj <mpxj>/junit/data/generated --xer CCA.xer Expressway.xer --json eval/finish-udfs-2026-11-22.json`

| | before (main) | after |
|---|---|---|
| Project Start/Finish values read as a UDF of the right kind (12 files) | 0 / 120 | 120 / 120 |
| ... written to the XER | 0 / 120 | 120 / 120 |
| ... back in Project XML, in a field of their kind, same title and value | 0 / 120 | 120 / 120 |
| CCA finish-date values back from Project XML as finish-date UDFs | 0 / 182 (182 as start dates) | 182 / 182 |
| P6 import problems (`p6Problems`) | 0 | 0 |

The round trip of the six public P6 files (`eval/p6xer-check.mjs --xer`) is
otherwise unchanged: CCA 13,174 of 13,174 numeric, cost and date UDF values
back, links 45,483 of 45,483, codes 255,410 of 255,410, schedule 14,266 of
14,270; the other five as before; 0 problems. With P6's own types compared
(no finish-to-start mapping), CCA keeps the type on 7,104 of 13,174 values;
main scores 6,922 on that measure (the 182 finish dates). The remaining
6,070 are the six decimal UDFs holding only whole numbers that come back as
integer UDFs (still open, `NEXT.md`).

Unit tests: `msproject.test.mjs` (activity, resource and WBS finish-date UDFs
both ways, the spill past ten Finish fields).

## Limits

- No Microsoft Project or P6 seat here: the field IDs come from Project's own
  saved files and MPXJ, not from opening the output in Project.
- Project's interim plans (Project > Set Baseline > Interim plan) also write
  Start1..10 and Finish1..10. A Project file with interim plans now carries
  them into P6 as date UDFs titled Start1, Finish1 and so on, where before
  they were dropped.
