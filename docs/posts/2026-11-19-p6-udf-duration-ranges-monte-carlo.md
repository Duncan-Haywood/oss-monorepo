---
title: "Monte Carlo on a P6 schedule with the ranges already in its UDFs"
seo_title: "P6 schedule risk from optimistic and pessimistic UDFs"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, schedule-risk, monte-carlo]
description: "XER Schedule Check now reads three-point duration ranges from a P6 file's own user-defined fields, so a risk run needs no retyping. Checked on six public files."
---

The hardest input to a schedule risk analysis is not the schedule. It is
the range on every activity: how short it could be, how long it probably
takes, and how long it could run. An XER export stores one duration per
activity, so until now [XER Schedule Check](../../ventures/xer-schedule-check/)
used a default range (90% / 100% / 125% of the remaining duration) unless
someone pasted per-activity numbers by hand.

A planner who has already done a risk review may keep those numbers in the
schedule itself, in activity user-defined fields (UDFs) with names like
*Optimistic Duration* and *Pessimistic Duration*. The XER export carries
those fields, in its `UDFTYPE` and `UDFVALUE` tables. The risk run now reads
them.

## What it does

When a file has numeric activity UDFs, the risk box shows three pickers:
optimistic, most likely and pessimistic. The tool fills them by reading the
field names:

- a word that names one point on its own: *optimistic*, *pessimistic*,
  *most likely*, *best case*, *worst case*;
- or a weaker word beside a duration word: *Min Dur*, *Max Duration*,
  *Low Days*, *WC %*.

"Max Qty", "Max Units" and "Min/Max Dur" are not read, because a quantity or
a field holding two points is not a range point. The unit also comes from
the name: working days of the activity's own calendar by default, hours if
the name says hrs or hours, percent of the remaining duration if it says %.
If there is no most-likely field, the file's remaining duration stands in.
An activity with only some of the fields filled keeps the default range and
is named in the result, and so is one whose points are out of order. A line
pasted by hand still wins for its activity.

From a terminal: `node cli.mjs schedule.xer --risk 1000 --ranges-udf auto`,
or name the fields: `--ranges-udf "Opt Dur,-,Pess Dur"`.

## How it was checked

None of the six public XER files the tool is measured on keeps duration
ranges, so the test plants them: three two-decimal UDFs on every open
activity of each file, 16,989 activities in all, with one in ten given only
the optimistic value. Two questions:

1. **Does reading the UDFs give the same answer as typing the numbers?** In
   24 of 24 runs (each file in days, hours, percent and with no most-likely
   field), the percentiles, criticality index and sensitivity of every
   activity equal the run with the same numbers pasted as CSV. The 1,897
   half-filled activities were all named and left on the default.
2. **Does it leave other UDFs alone?** Two of the files have 16 numeric
   activity UDFs of their own (costs, percent complete, "No.of Wor Days",
   "Duration|Differe"). None was read as a range.

The full table is in
[the eval note](../../ventures/xer-schedule-check/eval/udf-ranges-check-2026-11-19.md).

## What it cannot tell yet

Whether real schedulers name their fields the way the guess expects. None
of the public XER files we have keeps real ranges. If a guess misses, the
pickers take any numeric field by hand, so the cost of a miss is three clicks, not a
wrong answer. A real export from a job that went through a risk review is
the next check.

The file never leaves the browser. The tool is free and MIT-licensed.
Results are screening estimates and not professional advice. Have a
qualified scheduler review a schedule before relying on it.
