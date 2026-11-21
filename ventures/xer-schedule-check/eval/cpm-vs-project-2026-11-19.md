# Microsoft Project XML (MSPDI) files through the same engine, 2026-11-19

`mspdi.mjs` reads a Microsoft Project XML file (File, Save As, XML Format)
into the tables the XER reader returns, so the DCMA check, the CPM engine,
the comparison, windows, risk and levelling run on it unchanged. This file
records how close the recomputed dates come to what Microsoft Project
itself stored in each file.

## Files

Every MSPDI file in the test corpus of MPXJ (github.com/joniles/mpxj,
`junit/data`, cloned 2026-11-19 with a sparse checkout; the files are read
for measurement and are not copied into this repository). They were saved
by Microsoft Project 2002, 2003, 2007, 2010, 2013, 2016 and 2019 (`SaveVersion`
12 and 14, plus older files with none), 102 files with 2,491 open tasks.
They are small test projects, not construction schedules: only 10 of them
carry logic (65 links), the rest exercise calendars, durations, baselines,
constraints, manual scheduling, resources and timephased work.

## Command

```
node eval/cpm-vs-project.mjs <mpxj>/junit/data --json eval/cpm-vs-project-2026-11-19.json
```

A task matches when early finish (Project's `Finish`), late finish
(`LateFinish`) and total float (`TotalSlack`, tenths of a minute) all equal
the recomputed ones. Dates are compared in working time: Project writes a
late finish bounded by a successor's start as that start (08:00 the next
working day) where P6 writes 17:00 the day before, the same point in
working time.

## Result

**2,406 of 2,491 open tasks (96.6%) match on all three** (2,442 since 2026-11-21, once resource calendars and Resume dates are read: `eval/resource-calendars-2026-11-21.md`); early finish on
2,447, late finish on 2,426, total float on 2,411. 86 of the 102 files match
on every task, including every calendar, duration-unit, baseline, constraint
and link-type file from Project 2007 to 2019.

The 85 that do not, by cause:

| Tasks | Files | Cause |
|---:|---|---|
| 61 | assignment-assignments (7 versions), mspdiassignmentfields, mspdiresource, mspdisplittask, mspditimephased, mspditimephasedsegments | Dates driven by resource assignments, work contours, split tasks or timephased work. The engine schedules a task by its duration on its calendar, as P6 does for a task-dependent activity; it does not model splits or assignment-driven dates. |
| 16 | legacy/sample.xml | A pre-2007 sample whose stored project finish (2003-03-18) is earlier than its own tasks' finish (2003-05-26); early finish matches on 15 of 16, late dates do not. Not explained further. |
| 4 | mspdiduration | Late finish two working days later than Project's on four tasks with no links. Not explained. |
| 4 | task-links (2016 and 2019) | Manually scheduled tasks whose only successor is start-to-start or start-to-finish: Project gives them the project finish as late finish; the engine bounds them by the successor's start, as P6 does. The same file saved by Project 2007 to 2013 (auto-scheduled tasks) matches 16 of 16. |

## What changed to get here

- First run, before fixes: 1,398 of 2,491. Elapsed-duration formats were
  read from the wrong code table (Project's duration format codes run 3 to
  12 for units, 19 and 20 for percent, and 35 to 52 for the same with a
  question mark), so every "estimated" task was put on a 24-hour calendar.
  After the fix: 2,043.
- Manually scheduled tasks were first read as "start on" (a hard
  constraint), which fixed their late dates too; Project still gives them
  late dates from the logic. Read as "start on or after" their typed start
  and listed by name in the warnings: 2,394.
- With no status date the data date is the earliest task start rather than
  the project start (a manual task can sit before the project start and
  Project leaves it there), and dates are compared in working time: 2,406.

## Limits

- No real construction schedule saved from Microsoft Project was available
  in this session; the corpus proves the reader and the unit, calendar and
  link handling, not behaviour on a 3,000-task job. The next file through
  it should be one.
- Not modelled: resource-driven scheduling, task splits, deadlines (counted
  in the warnings), recurring calendar exceptions that a non-Project tool
  writes without listing their days (counted in the warnings), schedules
  scheduled from the finish date (checked forward, with a warning),
  inserted subprojects and cross-project links (left out, counted).
