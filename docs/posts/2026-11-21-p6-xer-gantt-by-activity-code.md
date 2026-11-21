---
title: "Grouping a P6 schedule by activity code without P6: the subcontractor's view of an XER"
seo_title: "Group a Primavera P6 XER Gantt by activity code, free"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer, gantt]
description: "XER Schedule Check now groups the Gantt by a P6 file's activity codes (responsibility, area, phase), nested codes as a tree, checked on four public files."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a Primavera P6
`.xer` export in the browser. Since yesterday it draws a Gantt chart: the WBS
as a tree, a bar per activity, the dates P6 would give them. Today the chart
can be **grouped by the file's activity codes** too.

## Why the WBS is not enough

A WBS answers "what is being built". Most of the questions people ask a
schedule are about something else:

- the electrical subcontractor wants *their* work, in date order, wherever it
  sits in the WBS;
- a superintendent wants one floor or one zone;
- an owner's rep wants the work that hands over a building, by phase.

P6 answers those with **activity codes**: code types such as Responsibility,
Area, Phase or Trade, each with a list of values, one value per activity. In
P6 you pick them under Group and Sort. Without a P6 seat, which is the
position of most subcontractors, owners and lenders who receive an XER, you
cannot.

## What it does

Open an XER, choose a code type under **Group by**, and optionally a second
level under **then** (the WBS, or another code). The types offered are the
ones this project's activities use, global types first, then the project's
own, each in P6's order. A value that has values below it (P6 allows nested
codes) draws as a tree. Activities with no value of that type go under
"no Responsibility" (or whichever type) at the end, so nothing drops off the
chart. Each group gets a summary bar, a count, and folds on a click. Critical
only, search, baseline bars, the printable page and the CSV all work the same
way as with the WBS.

From the command line:

```
node cli.mjs schedule.xer --gantt --codes
node cli.mjs schedule.xer --gantt --group-by "Responsibility,WBS" --html gantt.html
```

## How it was checked

P6 does not store a layout in the XER, so there is no "P6's answer" to
compare against. Instead, a separate script reads the three code tables
(`ACTVTYPE`, `ACTVCODE`, `TASKACTV`) and the WBS table itself, without going
through the grouping code, and checks every chart against them. Four of the
six public P6 files used for this tool carry codes: a 16,146-activity hospital
job with 37 code types (four of them nested), a hotel with 5, a P6 24.12 demo
with 3 and a small terminal building with 1. For every code type, two charts:
the type alone, and the type then the WBS, 92 charts in all.

- Every activity sat under the value the file gives it and that value's
  parents: **1,239,716 of 1,239,716** placements.
- Each group's count matched an independent tally (943 of 943), and every
  group bar spanned exactly the work under it.
- Values came out in P6's `seq_num` order, with "no value" last.

A check that always passes can still be a broken check, so three bugs were
planted in the grouping code: the order reversed, nested parents dropped, a
count off by one. Each one failed the check, on both files it was run on. The
whole run takes 11 seconds for 74 charts of the hospital file, about 0.15 s
a chart.

The method, numbers and what was not checked (EPS-scoped codes, order ties
against a real P6 layout) are in
[`eval/activity-codes-2026-11-21.md`](../../ventures/xer-schedule-check/eval/activity-codes-2026-11-21.md).

## What it shows on the hotel file

Grouped by Responsibility then WBS, the hotel schedule's main contractor holds
2,311 of its 4,217 activities. No WBS node says that. On the hospital file
every activity carries a building code, so one building's work can be read
across the whole WBS.

The tool is free and MIT licensed, and nothing is uploaded: the file is read
in your browser. It is not professional advice, so check dates against the
scheduling software of record before acting on them.
