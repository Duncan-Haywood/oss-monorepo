---
title: "The near-critical work a float filter misses: Monte Carlo risk in a P6 schedule review"
seo_title: "Near-critical P6 activities a float filter misses"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, schedule-risk]
description: "On a 14,270-activity P6 programme, the 18 activities that drive the finish in a quarter of Monte Carlo runs all have 15+ days of float."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) already wrote a
review an owner's rep can send a contractor: the DCMA 14-point faults, ranked,
with the exact activities behind each. It also ran a Monte Carlo finish-date
risk analysis. The two did not meet. Now they do: run the risk analysis on the
page, and the printed review carries a **Finish date risk** section (the ranges
assumed, P10 to P90 with and without the risk register, the chance of the
forecast and must-finish dates, the events ranked) and three corrections a risk
run can back.

## The three asks

- **Must-finish date met in under half the runs** (high; under 80% medium):
  show the recovery or the time extension. The review says whether the
  forecast itself already misses the date or only the uncertainty does.
- **Near-critical activities**: off the forecast's driving path, but driving
  the finish in a quarter or more of runs (medium). Manage them as critical.
- **No stated contingency** when the forecast is met in under half the runs
  (low).

## What it found on six real files

On six public P6 exports (P6 5.0 to 24.12), using the default range of 90 /
100 / 125% of remaining duration:

- The near-critical list was identical between two random seeds on every file
  that had one, so it is not sampling noise.
- On the largest file, a 14,270-activity programme, the risk run flags **18
  activities with 15.7 to 18.7 working days of total float**. A reviewer's
  usual "float under 10 days" filter lists 746 activities on that file and
  **none of these 18**. Their paths are long enough that a 25% tail on every
  duration lets them overtake the forecast's driving path in a quarter of runs.
- On a 4,217-activity hotel schedule, 617 activities have under 10 days of
  float; the risk run picks out 8 zero-float activities that sit off the single
  driving path.
- Every file with a must-finish date failed the must-finish ask (0 to 3.3% of
  runs on time), because the date sits 0 to 10 days after the forecast. That
  is often how P6 projects are set up, which is worth knowing before reading
  too much into it.

The ranges are the weak point: an XER file stores one duration per activity,
so the default is an assumption, and the review prints it as one. Paste ranges
from the people doing the work, or a risk register, and the same section uses
those.

Method and numbers: `ventures/xer-schedule-check/eval/review-risk-check-2026-11-19.md`.
Command line: `node cli.mjs schedule.xer --risk 500 --report review.html`.

Screening output from the file alone, not scheduling or contractual advice.
