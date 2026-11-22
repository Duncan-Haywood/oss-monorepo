# Microsoft Project interim plans on the way to P6, 2026-11-22

**Question.** Since this morning (`eval/finish-udfs-2026-11-22.md`) a Project
file's Start1..10 and Finish1..10 fields come into P6 as start- and
finish-date user-defined fields (UDFs). That run named the catch in its
limits: Project's interim plans (Project > Set Baseline > Interim plan) are
stored in the same fields. A Project file with an interim plan now reaches
P6 with two date UDFs titled Start1 and Finish1 that nobody asked for, and
nothing said so. Can the converter tell an interim plan from a planner's own
date fields, say so, and leave it out on request, without losing anything
else?

## What changed

- `mspdi.mjs`, `interimPairs(file)`: names a Start k / Finish k pair as an
  interim plan when neither field has an alias, it is set on at least two
  tasks, at least 90% of the tasks holding either field hold both, and the
  start is never after the finish. `sameSpan` counts the tasks whose pair
  spans exactly the task's own Start to Finish (a fresh copy has all of them).
- `parseMspdi(text, { interim, skipFields })`: every read of a Project file
  names such a pair in its warnings. `interim: "skip"` leaves the pair out of
  the activity and WBS UDFs; `skipFields` leaves out any named task Number,
  Cost, Date, Start or Finish field, and names a field it does not know.
  The default is unchanged (`"keep"`, nothing skipped).
- `p6xer.mjs` takes both options through; CLI `--no-interim` and
  `--skip-fields Start1,Finish1` (on `--to-p6` and on any `.xml` read); the
  page's "Microsoft Project to P6" box gains a "leave out interim plans"
  checkbox.

## Data

MPXJ's `junit/data` (github.com/joniles/mpxj, sparse clone 2026-11-22, read
for measurement, not copied here): 143 Project XML files saved by Project
2002 to 2019, ProjectLibre and other tools. None carries an interim plan:
searched for a Start/Finish pair on the same tasks, none found (the only
Start and Finish values are in MPXJ's task-starts and task-finishes files,
one field per task). So the interim plans below are planted, in a pair the
file leaves free, on every file with two or more dated tasks (90 files).

## Results

`node eval/interim-plans.mjs --mpxj <mpxj>/junit/data --json eval/interim-plans-2026-11-22.json`

| | named | with `interim: "skip"`, the XER's UDFs equal the unplanted file's | kept by default, the XER adds exactly Start k and Finish k | P6 import problems |
|---|---|---|---|---|
| 143 files as saved | 0 pairs | | | |
| fresh: every task, a copy of Start and Finish | 90 / 90 | 90 / 90 | 90 / 90 | 0 |
| selected: every other task | 84 / 84 | 84 / 84 | 84 / 84 | 0 |
| moved: copied 5 days before Start, 3 before Finish | 90 / 90 | 90 / 90 | 90 / 90 | 0 |
| no field definitions in the file | 90 / 90 | 90 / 90 | 90 / 90 | 0 |
| aliased pair (Permit Start / Permit Finish) | 0 / 90 | | | |
| Start k alone | 0 / 90 | | | |
| one task's Start k after its Finish k | 0 / 90 | | | |
| a planner's own unaliased pair on two tasks | 90 / 90 (false alarm) | | | |

354 of 354 planted interim plans named and, on request, dropped with every
other UDF value unchanged; 0 false alarms on the 143 files as saved. The 6
files left out of "selected" have one task besides the project summary
task, so the plant would hold one task, which the rule leaves alone by
design. On three files with summary tasks the kept pair lands twice, as
activity and WBS UDFs, as Project's summary tasks hold the copy too.

The MPXJ task-starts and task-finishes round trip
(`eval/finish-udfs.mjs`) is unchanged: 120 of 120.

Unit tests: `interim.test.mjs` (named, kept, skipped, the CLI flags, and the
cases that must not be named).

## Limits

- No real Project file with an interim plan was found in public test data,
  so every positive above is planted. What Project writes for the fields'
  definitions after Set Baseline > Interim plan was not seen; both a
  definition without an alias and none at all are covered.
- A planner's own unaliased Start/Finish pair (two "Start1 = permit start,
  Finish1 = permit finish" dates on the same tasks) looks the same and is
  named too. That is why the default keeps the pair and only warns: the
  planner decides, or gives the fields an alias in Project.
- Project's interim plans can also copy a baseline or another pair into a
  pair; the rule does not look at where the dates came from, only at their
  shape, so those are named the same way.
- No P6 or Project seat here: the XER was checked with `p6Problems`, not
  imported into P6.
