# Microsoft Project XML: split tasks, 2026-11-21

`eval/resource-calendars-2026-11-21.md` left 49 of 2,491 open tasks in
MPXJ's 102 Microsoft Project XML (MSPDI) test files whose recomputed dates
or float differ from what Project stored. Two of them were named "split
tasks, not modelled". This run reads splits. It fixes those two and five
more tasks that turn out to be split too.

## Command

```
node eval/cpm-vs-project.mjs <mpxj>/junit/data
```

Corpus unchanged: every MSPDI file in MPXJ's test data (github.com/joniles/mpxj,
`junit/data`, sparse checkout on 2026-11-21; read for measurement, not copied here).

## Result

| | before | after |
|---|---:|---:|
| open tasks equal on early finish, late finish and total float | 2,442 | **2,446 of 2,491 (98.2%)** |
| early finish | 2,483 | 2,490 |
| late finish | 2,446 | 2,448 |
| total float | 2,444 | 2,447 |

Files changed (the other 100 read exactly as before, line for line):

| File | Before | After |
|---|---|---|
| mspdisplittask.xml | 0 / 2 (EF 0, LF 0, TF 1); finish 2006-10-11 | **2 / 2**; finish 2006-10-18 17:00 = Project's |
| mspditimephased.xml | 10 / 30 (EF 25) | 12 / 30 (**EF 30**) |

The seven tasks the reader now finds split are the only ones in the corpus:
Split Task 1 (one split) and Split Task 2 (three) in mspdisplittask.xml, and
the five "Task 5" variants (day, night shift, 24 hour, 50%, 150% units) in
mspditimephased.xml. Every one now finishes where Project says.

## How Project stores a split

MSPDI has no split field on a task. The only trace is in the assignment's
timephased rows (`<TimephasedData>`, Type 1 = remaining work): a run of rows
whose `Value` is `PT0H0M0S` between rows with work. Rows with no `Value` at
all are non-working time (weekends, nights). In mspdisplittask.xml,
"Split Task 1" is 80 h of work whose Start and Finish (2006-09-21 to
2006-10-09) cover 104 working hours; its zero rows hold the other 24.
The task's stored total slack (56 h) is then exactly the working time from
its finish to the project's.

## Rule

`mspdi.mjs` collects, per task, the zero-value Type 1 rows of all its
assignments, keeps the parts that lie between its first and last work and
in which no other assignment of the task works, and writes them on the task
row as `split_gaps` (not a P6 column). `cpm.mjs` adds the working time
(on the task's calendar) of those gaps to the task's span in both passes:
all of them for a task not started; for one in progress, only the part
after its Resume date (or the data date). A split keeps its length in
working time when the task moves, so a task pushed by a new predecessor
carries its splits along rather than keeping their old calendar dates.
That is Project's behaviour when a split task is rescheduled. A finished
task's splits are history and are not read. The warnings name the number
of split tasks and say an XER written from the file loses them (P6 has no
splits).

## Tests

`mspdi.test.mjs`, one new test: a 16 h task saved as Monday's work, a split
on Tuesday and Wednesday's work finishes Wednesday (Tuesday without the
split) and its FS successor Thursday; a zero row while another assignment
works is no split; rows without a value are no split; pushed a day by a new
predecessor it finishes Thursday (the split moved, 8 working hours kept);
in progress with Resume after the split, the split adds nothing.
`node --test` on the venture: 286 tests, 0 failures.

## What is left (45 tasks)

| Tasks | File | Reading |
|---:|---|---|
| 18 | mspditimephased.xml | Early finish 30 of 30 now. Late finishes sit near each group's own latest early finish although no task has a successor (no logic rule gives that; unchanged). |
| 18 | mspditimephasedsegments.xml | Same pattern in late dates. |
| 4 | mspdiduration.xml | Project contradicts itself between identical unlinked tasks. |
| 4 | task-links, Project 2016 and 2019 | Manual tasks on SS/SF-only successors. |
| 1 | mspdiassignmentfields.xml | Assignment delay and contour. |

## Limits

Two small test files hold every split in the corpus. A split stored only at
the task level in an .mpp (MPXJ reads those from the binary) is out of reach
of an XML reader, and a real construction schedule with split tasks from
Project has not been read yet. Gaps are counted on the task's calendar,
including when the task runs on its resources' calendars; a split task
whose resources work a different calendar from the task's own is untested.
