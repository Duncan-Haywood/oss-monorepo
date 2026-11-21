# Microsoft Project XML: resource calendars and Resume dates, 2026-11-21

`eval/cpm-vs-project-2026-11-19.md` left 85 of 2,491 open tasks in 102
Microsoft Project XML (MSPDI) files whose recomputed dates or float differ
from what Project stored, and called two groups "not explained". This run
went back to those tasks one file at a time. Two Project rules the reader
did not model explain 36 of them. Nothing that matched before stops matching.

## Command

```
node eval/cpm-vs-project.mjs <mpxj>/junit/data --json eval/cpm-vs-project-2026-11-21.json
```

The corpus is unchanged: every MSPDI file in MPXJ's test data
(github.com/joniles/mpxj, `junit/data`, sparse checkout on 2026-11-21; read
for measurement, not copied here).

## Result

| | before (2026-11-19) | after resource calendars | after Resume too |
|---|---:|---:|---:|
| open tasks equal on early finish, late finish and total float | 2,406 | 2,424 | **2,442 of 2,491 (98.0%)** |
| early finish | 2,447 | 2,457 | 2,483 |
| late finish | 2,426 | 2,446 | 2,446 |
| total float | 2,411 | 2,426 | 2,444 |

Files changed (every other file reads exactly as before):

| File | Before | After |
|---|---:|---:|
| legacy/sample.xml | 0 / 16 | 16 / 16 |
| mspdiresource.xml | 0 / 2 | 2 / 2 |
| assignment-assignments, Project 2002, 2003, 2007, 2010, 2013, 2016, 2019 | 1 / 3 each | 3 / 3 each |
| mspditimephased.xml | 6 / 30 | 10 / 30 (early finish 9 to 25) |
| mspditimephasedsegments.xml | 2 / 20 | 2 / 20 (early finish 17 to 20) |

## Rule 1: a task works when its resources work

The 2026-11-19 note called legacy/sample.xml a stale file: its stored
project finish (2003-03-18) is ten weeks before the finish the engine
computed (2003-05-26). The reason is one task. "Second Task" stores a
Duration of 800 h, but its Start and Finish (2003-01-07 08:00 to 2003-03-18
08:00) cover only 400 h of the project calendar. Its two resources are on
calendars of their own: one works the day, the other a night shift (its
assignment starts at 23:00). 400 h of the day calendar plus 400 h of the
night calendar is the 800 h Project stores. **Project counts a task's
duration in the time any of its work resources is working**, each on its
own calendar. So the file was not stale. The engine was counting 800 h on
the day calendar alone, which runs to May.

`mspdi.mjs` now reads `<Resources>` and `<Assignments>`. A task that has
work resources (Type 1; material and cost resources have no calendar that
counts) and does not tick "ignore resource calendars"
(`IgnoreResourceCalendar`) runs on the union of its resources' calendars,
day by day, holidays included. When the task also has its own calendar, each
resource's calendar is first cut down to the time it shares with the task's
calendar. A resource calendar that adds nothing to its base calendar
resolves to that same calendar, so the usual file, where every resource has
an unchanged copy of Standard, reads exactly as before. A task whose own
calendar shares no working time with any of its resources stays on its own
calendar and is counted in the warnings. Project warns about that case too.
Every task moved onto its resources' calendars is counted in the warnings.

This fixed legacy/sample.xml (16 of 16, and the project finish is now
Project's 2003-03-18 08:00). It fixed mspdiresource.xml's three-resource
task with a night-shift resource (2 of 2) and the night-shift and 24-hour
tasks in mspditimephased.xml (early finish 9 to 15).

## Rule 2: remaining work restarts at Resume

The assignments files saved by seven versions of Project each had two
in-progress tasks off by days. Neither file has a status date. Project
stores where the remaining work of a task in progress restarts in `Resume`
(Task 2 here: 25% done, stopped 2016-01-06 12:00, resumes 13:00). The reader
already took the earliest start as the data date, as before, so the
remaining 60 h ran from 2016-01-04 and finished two days early.

The reader now passes `Resume` through (`resume_date`, MSPDI only; P6 files
have no such column, so no XER result can change). The engine starts an
in-progress task's remaining work no earlier than it. With a status date
after the Resume date, the work still starts at the status date, as P6
does. The assignments files are now 3 of 3 in every Project version, and
early finish in the two timephased files went from 15 to 25 and from 18
to 20.

## What is left (49 tasks)

| Tasks | File | Reading |
|---:|---|---|
| 20 | mspditimephased.xml | Early finish matches on 25 of 30. Project's stored late finishes are not the project finish: each group of tasks in the file (day, night shift, 24 hour, 50%, 150%) has a late finish near that group's own latest early finish, although no task has a successor. No logic rule gives that. The tasks carry work contours and edited timephased work. Not modelled. |
| 18 | mspditimephasedsegments.xml | Early finish 20 of 20. Late dates show the same pattern as above. |
| 4 | mspdiduration.xml | Ten unlinked tasks, all with the same start. Tasks 1 to 4 (minutes, hours, days, weeks) store a late finish of 2009-04-21 17:00, two working days before the project finish. Task 5, a month-format task in the same position, stores 2009-04-23 17:00, which is the project finish. Project contradicts itself between identical cases, so no rule can match both. Left as Project's own inconsistency. |
| 4 | task-links, Project 2016 and 2019 | Manually scheduled tasks whose only successor is start-to-start or start-to-finish (unchanged from 2026-11-19). |
| 2 | mspdisplittask.xml | Split tasks (a gap in the middle of the work). Not modelled. |
| 1 | mspdiassignmentfields.xml | Assignment with a delay and contour. The finish moved closer (10:34, now 11:29; Project 16:01). Not modelled. |

## Tests

`mspdi.test.mjs` adds two tests:

- resource calendars: a day-shift resource on an unchanged copy of Standard
  (stays on Standard), a night shift (6 h a night: 12 h ends at midnight on
  Tuesday), day and night together (14 h on Monday), "ignore resource
  calendars", a material resource only, and a task calendar sharing no time
  with its resource (stays on its own calendar, warned);
- Resume: no Resume, a Resume two days after the data date, and a status
  date after the Resume date, each with a successor.

`node --test` on the venture: 213 tests, 0 failures.

## Limits

These are MPXJ's test projects, not construction schedules. A real job from
Project with a night-shift crew is the next file that should go through this.
Resource levelling of MSPDI files still ignores the assignments; only the
calendars are read.
