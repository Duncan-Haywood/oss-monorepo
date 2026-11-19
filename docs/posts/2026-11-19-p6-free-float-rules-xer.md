---
title: "How P6 computes free float: four rules, 18,537 to 19,809 of 19,822 activities"
seo_title: "How Primavera P6 computes free float: four rules"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, critical-path]
description: "Four free-float rules found by matching six public P6 XER files, plus a fix for XER files with no data date that used to crash the checker."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a Primavera
P6 schedule in the browser and compares its numbers with the ones P6 stored in
the XER file. Early dates, late dates and total float already matched on 99.9%
of 19,822 open activities in six public files. Free float did not: only 18,537
(93.5%) matched. Free float is the number a reviewer reads to see how far one
activity can slip before it pushes anything else, so it is worth getting right.

Four rules close nearly all of the gap. Free float now equals P6's on
**19,809 of 19,822 (99.93%)**.

## The four rules

1. **An activity with no successor gets free float up to the project's early
   finish, not up to the must-finish date.** Total float runs to the must-finish
   date, free float doesn't. In a P6 24.12 file whose must-finish date sat
   48.02 hours after the forecast finish, 34 activities with no successor each
   had exactly 48.02 hours too much free float.
2. **On a start-to-start link to an activity that has already started, the lag
   is spent.** Our forward pass already used this rule, but the free-float
   formula still subtracted the lag. That gave -32 to -112 hours where P6 has 0.
3. **The same goes for a start-to-start link out of an activity that has
   already started.** The successor waits for the later of two times: when the
   predecessor's remaining work starts, or its actual start plus the lag. Lag
   already spent before the data date is not free float.
4. **A finished successor still counts.** It sits in the network as a
   zero-length node at the data date, and an activity in front of it can't
   slip past that node.

On top of those, **free float is never negative, and it is not capped at total
float.** The six files store 20,127 free-float values and none is below zero.
Many activities have negative total float and still hundreds of hours of free
float: one has a total float of -320.8 hours and a free float of 343.2 hours.
The old code took whichever was smaller, the gap or the total float.

| File | Before | After |
|---|---|---|
| 16,000-activity progressed programme (P6 6.0) | 13,029 / 14,270 | 14,266 |
| Office demo (P6 24.12) | 361 / 404 | 395 |
| Airport terminal (P6 5.0) | 65 / 66 | 66 |
| Three others | all | all |

The first rule also fixed the last date mismatch in a hotel schedule. That's
because the as-late-as-possible step moves an activity later by its free float.
A finish milestone now lands at P6's 16:00 instead of 17:00, so early finish,
late finish and total float now match on 19,808 of 19,822 activities.

## What is still different

Thirteen activities. Four are in the progressed programme, on activities whose
dates already differ from P6's. Their free float should follow once those dates
match. The other nine are in the 24.12 file, and the file can't explain them:
P6 stored a free float of 0 where its own stored dates leave a gap. One activity
finishes on 11 November and its only successor starts on 20 November, in P6's
dates and in ours, yet P6 stores 0. We left those nine alone instead of
inventing a rule to fit them.

## A crash on files with no data date

Two of the public repositories also hold small hand-made test XERs. Both crashed
the checker. They have no data date, so an activity with no predecessor had no
date to start from. One also had no PROJECT table, and its calendars had no work
pattern. XERs written by converters or edited by hand can look like that. Now:

- the dates count from the earliest date the file stores;
- activities whose project isn't in the PROJECT table get a project of their own;
- a calendar with no pattern becomes Monday to Friday at its stated hours per
  day.

Each of these guesses shows up as a warning, and both files now get a full
DCMA report.

## Where you see it

The page has a new button, **Download recomputed schedule (CSV)**, and the CLI
a matching `node cli.mjs file.xer --schedule out.csv`. The CSV has one row per
open activity: early and late dates, total float and free float in days and
hours, the values the file stores, and a column saying whether they agree. If
you receive XER files but don't have a P6 licence, this is the activity table
you couldn't get before, and you can sort it by free float.

Method, the ablation for each rule and the list of the 13 that still differ:
[`eval/free-float-2026-11-19.md`](../../ventures/xer-schedule-check/eval/free-float-2026-11-19.md).
