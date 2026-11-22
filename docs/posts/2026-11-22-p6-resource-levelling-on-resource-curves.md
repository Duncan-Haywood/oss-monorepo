---
title: "Levelling a P6 schedule on its resource curves, not its averages"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, resource-levelling]
description: "XER Schedule Check can now level each P6 assignment at its resource curve's rate. On a public hospital file one curved crew moves the levelled finish both ways."
---

A Primavera P6 assignment can follow a **resource curve**: Back Loaded, Bell
Shaped, Front Loaded, or one a planner drew. The curve says how the units are
spread over the activity's duration, in twenty slices. A back-loaded crew
works at 70% of its average for the first half and 130% for the second.

[XER Schedule Check](../../ventures/xer-schedule-check/) already spread
earned value by these curves. Its resource levelling did not: every
assignment used its average rate from start to finish. That hides two
things. A back-loaded crew leaves room early that the average fills, and a
curve's peak can pass a crew limit that the average stays under.

## What changed

With `--level --curves` (or "Spread each assignment: on its P6 resource
curve" in the levelling box on the page), each curved assignment is cut into
its curve's twenty slices of working time, on the activity's own calendar.
Each slice is levelled as a span of its own, at the average rate x 20 x the
slice's share. The slices' units add up to the assignment's, which a unit
test checks for durations from 1 minute to 10 days.

Two small cases from the tests show both effects:

- Crew limit 2. A 10-day back-loaded activity at 1 unit an hour, and a 5-day
  activity at 1.2 beside it. On averages, 1 + 1.2 > 2, so the second waits
  10 days. On the curve, the first half runs at 0.7: 0.7 + 1.2 fits, and
  nothing moves.
- Crew limit 1.6. The same back-loaded activity and a 0.5 activity. On
  averages 1.5 fits. On the curve the second half runs at 1.3, and 1.8 does
  not: the leveller moves the second activity.

## On a real file

Of the six public P6 files the tool is checked on, one carries curves on
levelled work: the CCA hospital schedule (P6 6.0). 36 of its assignments
name a curve the file carries, but 35 sit on level of effort or WBS summary
activities, which levelling leaves alone. The one left is an electrical
activity on the file's own late-bell curve, at 134 units an hour on average
and 347 at its peak, on the general labour pool.

That pool has P6's default limit of 1 unit an hour, so the levelling run
scales it. With the curve read, the levelled finish moves both ways:

| Labour limit | Even spread | On the curve |
|---|---|---|
| x50 | 2014-04-30 (+260 working days) | 2014-06-10 (+293.3) |
| x100 | 2013-09-02 (+60.4) | 2013-08-28 (+57.0) |
| x200 | 2013-06-22 (+0) | 2013-06-22 (+0), 48 activities moved instead of 8 |

One assignment out of 36,808 moves the finish by weeks, because it is
large and its peak is two and a half times its average.

## What we do not know

No public XER stores dates from P6's own leveller with a curved assignment,
so whether P6 levels on the curve or on the average is not shown. The
default stays the even spread, and curves are one switch away. A P6 user with
a levelled export of a curved job could settle it; the full measurement,
including curves planted on the other public files, is in
`ventures/xer-schedule-check/eval/level-curves-2026-11-22.md`.

Free, MIT licensed, runs in the browser, nothing uploaded. Screening
figures, not scheduling or contractual advice.
