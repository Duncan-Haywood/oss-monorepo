---
title: "A DCMA 14-point check for Microsoft Project schedules, and the duration code that sent tasks round the clock"
seo_title: "DCMA 14-point check for Microsoft Project XML schedules"
date: 2026-11-19
tags: [construction, scheduling, microsoft-project, dcma, critical-path]
description: "Save a Microsoft Project schedule as XML and run the DCMA 14 points, the update comparison and the risk run on it in the browser. Checked on 102 Project files."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) began as a tool for
Primavera P6 exports. Plenty of the schedules an owner's rep gets each month
come out of Microsoft Project instead, mostly on smaller commercial and
residential jobs, and until today those people had nothing to open them with
here.

Now they do. In Microsoft Project use **File, Save As, XML Format** and open
the `.xml` file anywhere the page takes an `.xer`: the 14-point check, the
comparison of two monthly updates, the windows delay analysis, the Monte
Carlo finish risk, resource levelling and the written review. It all still
runs in the browser, and the file is never uploaded.

## How Project's terms map onto P6's

The new reader (`mspdi.mjs`) turns Project's XML into the same tables an XER
file holds, so the checks and the scheduling engine did not have to change:

- **Summary tasks** become WBS nodes and are left out of the network, as P6
  treats WBS summaries. Project lets a link on a summary task drive every
  task under it, which hides the real logic, so those links are listed in
  the warnings, not followed.
- The **status date** is the data date, and **baseline 0** gives the
  planned dates that the missed-task and BEI checks read.
- **Lags** count on the successor's calendar, which is what Project does. An
  elapsed lag ("2 edays") runs on a 24-hour clock. A percent lag becomes that
  share of the predecessor's duration.
- Activities are matched between two updates by **Unique ID**, not the row
  number, so inserting a row at the top of the schedule doesn't turn every
  task into "deleted and added".
- A **manually scheduled task** keeps its typed start (read as "start on or
  after") and is named in the warnings. Its dates don't move with the logic,
  so a reviewer wants it switched to auto scheduled.

## Checked against Project's own numbers

No real construction schedule saved from Project was available to test on.
The MPXJ project keeps a public test corpus of files saved by Microsoft
Project 2002 through 2019, so we ran all 102 of its MSPDI files through the
engine and compared the result with the dates and slack Project stored in
each file: **2,406 of 2,491 open tasks (96.6%)** agree on early finish, late
finish and total float. 86 of the files agree on every task, including every
calendar, duration-unit, baseline, constraint and link-type file from
Project 2007 to 2019.

Of the 85 tasks that don't agree, 61 have dates set by resource assignments,
work contours, task splits or timephased work. The engine schedules a task
by its duration on its calendar and models none of those. The other 24 are
in three small files, and the
[eval](../../ventures/xer-schedule-check/eval/cpm-vs-project-2026-11-19.md)
names the cause, or says when we don't know it.

## The bug the first run found

On the first run only 1,398 tasks matched, and the reason was a lookup
table. Project stores each duration's display unit as a code: 3 is minutes,
5 hours, 7 days, and the even codes from 4 to 12 are their "elapsed"
versions (`ed`, a calendar day of 24 hours). Codes 35 to 52 are the same
units with a question mark, meaning "estimated". The reader had the
estimated codes off by a few places, so every task Project marks as
estimated (a new task's default) was put on a 24-hour calendar. An
8-hour task then ran from 08:00 to 16:00, not 08:00 to 17:00 over a lunch
hour. With the table fixed, 2,043 tasks matched. Reading manual tasks as
"start on or after" instead of "start on" brought it to 2,394, and taking
the earliest task start as the data date when a file has no status date
brought it to 2,406.

## Limits

Microsoft's binary `.mpp` format can't be read; save as XML first. Deadlines,
task splits and resource-driven dates aren't modelled. A project scheduled
backward from its finish date is checked forward from its start, with a
warning. Like the rest of the tool, the fourteen points screen a schedule
for faults. A schedule that passes is not thereby sound, and none of this
is scheduling, contractual or legal advice.
