---
title: "Resource-dependent activities in P6: why the crew's calendar moves the dates, and 799 rows it fixed"
seo_title: "P6 resource dependent activity dates, checked against P6 23.12"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, cpm]
description: "In P6, a resource-dependent activity runs on its crews' calendars, not its own. XER Schedule Check now does too. Checked on 338 public P6 23.12 probe files."
---

Primavera P6 has an activity type most schedulers set once and forget:
**Resource Dependent**. A normal activity (Task Dependent) runs on its own
calendar. A resource-dependent one doesn't. Each crew or piece of equipment
assigned to it works on that resource's calendar, for its own hours. So the
same 24-hour activity finishes Wednesday morning with a crew on 12-hour days
and Wednesday evening on the office calendar. If the crane has a holiday the
activity calendar doesn't, the work waits for the crane.

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a P6
schedule in the browser to check its float, critical path and DCMA points.
Until today it scheduled resource-dependent work on the activity's own
calendar, like any other activity. On real schedules that rarely matters,
because most files give crews the same calendar as their activities. When it
does matter, it moves everything downstream.

## What P6 does, as far as public data shows

The test data is 338 synthetic XER files
([danafitkowski/cpp-cpm-engine](https://github.com/danafitkowski/cpp-cpm-engine),
MIT). The repository's author imported each one into P6 Professional 23.12.1,
pressed F9 and recorded P6's early and late dates and floats for every
unfinished activity. Many of the files probe resource-dependent work. From
those, the engine now follows these rules:

- Each labour or equipment assignment runs on its resource's calendar, for
  its remaining units over its units per hour. The clock starts at the
  activity's start plus the assignment's lag. Material doesn't drive the
  dates.
- The activity runs from its earliest assignment start to its latest
  assignment finish.
- **The start has to land on the activity's own calendar.** Suppose a crew
  could start at 06:00 but the activity calendar opens at 07:00, or the crew
  has the Monday off. P6 moves the remaining work to the activity calendar's
  next opening and runs every assignment again from there. It tries this
  twice at most: a weekend crew on a Monday-to-Thursday activity never lands,
  and P6 gives up after the second move.
- A finish-to-finish or start-to-finish requirement ends an assignment at its
  resource's last working time before the requirement. Late dates mirror the
  forward pass, and float is still counted on the activity calendar.

One thing has to happen before scoring: P6 re-sizes resource-dependent work
on import. In 228 of 294 import records it changed durations, units or
assignment rates. So the file P6 scheduled is not the XER byte for byte. The
probe folders record what P6 held after the import, and the scorer now lays
those values over each file first, as the probe author's own scorers do.

## The numbers

| | Rows | Before | After |
|---|---|---|---|
| All probe rows (P6's six values all equal) | 5,199 | 2,953 | **3,730** |
| Resource-dependent activities | 936 | 156 | **468** |

Compared row by row: 799 rows fixed and 22 made worse. Most of the 22 are
assignments with no work sitting beside ones with work, which P6 handles by a
late-date rule the engine doesn't model yet. On the six real P6 files the
engine is checked against, nothing changed: 19,908 of 19,935 activities still
match P6's stored dates.

Two caveats. The rules were read off these probes, so 3,730 is a fitted
score, not a held-out one. And no public real file has crews working
different hours from their activities, so the gain on real schedules is
unmeasured. If you have one and can share it, it would be the next test.

## What's still open

The probe READMEs say successors of resource-dependent work follow the
crews' *unsnapped* early finish, not the remaining dates P6 prints. Wiring
that in on the forward pass alone made the score worse, because the backward
pass needs a matching pair of late dates. That pair is the next item.
Multi-crew work under a start bound is open too. The full table, every step
and the variants that lost are in
[`eval/p6-probes-rd-2026-11-24.md`](../../ventures/xer-schedule-check/eval/p6-probes-rd-2026-11-24.md).

The tool is free and runs in your browser: nothing is uploaded. Results are
screening checks, not a substitute for the scheduler's or the contract's own
review.
