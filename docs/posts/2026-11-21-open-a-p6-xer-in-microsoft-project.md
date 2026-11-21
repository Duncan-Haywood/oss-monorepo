---
title: "Opening a P6 XER in Microsoft Project: what survives, and what Project will schedule differently"
seo_title: "Convert a Primavera P6 XER to Microsoft Project XML, free"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, microsoft-project, xer]
description: "A free in-browser XER to Microsoft Project XML converter, checked on six public P6 files: every activity and link survives, but Project's rules move some dates."
---

A common situation on a construction job: the general contractor schedules in
Primavera P6 and sends out an `.xer` file. The mechanical subcontractor, the
owner's project manager and the architect have Microsoft Project, not a P6
seat. They can ask for a PDF, which is whatever layout the contractor chose,
or buy a converter.

[XER Schedule Check](../../ventures/xer-schedule-check/) now does the
conversion in the browser. Open the XER, press **Download for Microsoft
Project**, then open the `.xml` in Project (File, Open). ProjectLibre and
GanttProject open it too. Nothing is uploaded. From the command line:
`node cli.mjs job.xer --to-project job.xml`.

## What goes across

- the WBS, as summary tasks in P6's order;
- each activity's ID, in Project's Text1 column, renamed "Activity ID";
- every calendar, with its working week and every holiday and changed day;
- relationships with their type and lag;
- constraints, mapped to Project's names (P6's "start on or after" becomes
  "start no earlier than", and so on);
- progress: actual dates, and the remaining work restarting where P6 has it;
- P6's planned dates, as baseline 0;
- resources and assignments, with their hours and cost.

## How it was checked

On six public P6 files (P6 5.0 to 24.12; 21,422 activities, 54,843
relationships) the converted files were checked two ways
([`eval/msproject-check-2026-11-21.md`](../../ventures/xer-schedule-check/eval/msproject-check-2026-11-21.md)):

1. **Read back with the tool's own Microsoft Project reader.** Every activity
   came back with the same name, status, remaining duration, actual dates,
   constraint, baseline and calendar (compared day by day), and every
   relationship came back with the same type and lag.
2. **Read by MPXJ**, the open-source library most schedule converters are
   built on, once from the XER and once from the converted file. It read the
   same name, dates, remaining duration, progress, constraint, calendar,
   predecessors and assignment hours and cost on every activity, with one
   exception that was written that way on purpose (below).

Neither check is Microsoft Project itself: there is no Project licence in the
build environment. MPXJ and the reader, which matches Project's own dates on 98%
of tasks in 102 Project files, stand in for it.

## What Project will do differently

Getting the data across is not the same as getting the same schedule. When
Project recalculates, it uses its own rules, and on these six files that
matters:

| Recomputed under | Open activities with the same early finish | Same early finish, late finish and float |
|---|---|---|
| Project's rules | 19,822 of 19,822 | 19,818 of 19,822 |
| P6's own settings for each file | 12,169 of 19,822 | 6,966 of 19,822 |

The first row says the conversion is faithful: run the same rules on both
files and you get the same schedule (4 activities in one heavily
out-of-sequence file differ in late dates, and why is still open). The second
row says the rules differ. The causes, each listed by the converter with a
count for your file:

- **Lags across calendars.** P6 usually counts a lag on the predecessor's
  calendar, Project on the successor's. A 2-day lag from a 7-day activity to a
  5-day one can come out at different lengths.
- **Float.** Project's total slack is the smaller of start and finish float and
  has no project must-finish date, so float moves even where dates do not.
- **Milestones.** Project has one kind of milestone. A P6 start milestone that
  has a predecessor lands at the end of the previous working day in Project,
  not the start of the next one.
- **Level of effort.** Project has no level-of-effort activity. Written as an
  ordinary task, a level of effort would drive its successors from a bar that
  never moves. The first version of the converter did that, and one file's
  finish moved 18 months. Level of effort is now a manually scheduled task on
  its P6 dates, with its P6 relationships written into the task notes
  ("SS from A1030, FF to A1200").
- **External dates.** Links to projects that are not in the file reach P6 as
  external early start and late finish dates. They become a start-no-earlier-than
  constraint and a deadline. That is the one field MPXJ reads differently,
  because MPXJ's P6 reader shows no constraint there.

Activity codes, user-defined fields, notes, steps and expenses are not carried
yet, and the converter counts each.

## Two bugs the second reader caught

MPXJ found two things the first reader missed, which is why it was worth
running a reader we didn't write:

- A finished assignment with no actual hours was written with its budgeted
  hours. P6's at-completion figure is actual plus remaining, which is zero.
  Work and cost differed on 73 of one file's 425 activities until that was
  fixed and work was written to the second rather than the minute.
- P6 stores a double quote inside a name as `""`. MPXJ reads that back as one
  quote, and the converter now does too.

The converter is MIT licensed, like the rest of the tool. The checks re-run
with `node eval/msproject-check.mjs <dir>` and
`python eval/msproject-mpxj.py <xer> <xml> ...`.

*Free tool, not scheduling, contractual or legal advice. Not affiliated with
Oracle, Primavera or Microsoft.*
