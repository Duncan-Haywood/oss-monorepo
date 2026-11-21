---
title: "P6 resource curves in an S-curve: 109,048 hours of difference on a public hospital schedule"
seo_title: "Primavera P6 resource curves in earned value, read from an XER"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer, earned-value]
description: "XER Schedule Check now spreads planned value along P6 resource curves. On a public hospital file the curved work runs up to 40% behind an even spread."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) computes earned value
and an S-curve from a cost- or hours-loaded Primavera P6 `.xer` export, in
the browser. Until today it spread every assignment's budget evenly over its
planned dates. P6 doesn't always do that: an assignment can follow a
**resource curve** (Back Loaded, Bell Shaped, or one the planner drew), and
the planned curve an owner pays against should follow it too.

## What the file carries

A curve sits in the `RSRCCURVDATA` table as 21 numbers, `pct_usage_0` to
`pct_usage_20`, one for each 5% point of the duration. An assignment names its
curve in `TASKRSRC.curv_id`. Every curve P6 ships starts at 0 and has twenty
values after that summing to 100, so the tool reads them as the share of the
work in each twentieth of the assignment's working time. That is also how
MPXJ, the open-source schedule reader, reads them. Back Loaded is ten slices
of 3.5% and then ten of 6.5%, so 35% of the hours fall in the first half.

The slices are cut by working time on the activity's own calendar, not
calendar time, so a weekend inside a span gets nothing.

## On a real file

Of the six public XER files the tool is tested on, one, a 16,000-activity
hospital schedule exported from P6 6.0, carries curves: six of them, used by
36 assignments. Twenty-five use a custom bell called "PCO119" that peaks
late; seven are Back Loaded.

Spread along their curves, those assignments' planned hours run behind the
even spread from the first month to the last. The widest gap is at the end
of March 2012: **161,678 hours planned on the curves against 270,726 evenly**,
109,048 hours (40%) apart. The two meet at the 834,430 budgeted hours on
1 May 2013.

On that file, an SPI computed from an even spread would make the curved
crews look about 40% further behind than their own plan says at that point.
The file's cost earned value doesn't move, because those 36 assignments carry
hours but no cost. The page's notes say which curves were used.

## What is not known

- **No public file has P6's own spread of a curved assignment** to compare
  with, so the slice reading is checked for consistency (every spread sums
  to its budget, Linear gives the even spread exactly), not against P6's
  numbers. An export with a curved, cost-loaded assignment and P6's Resource
  Usage view would settle it.
- **Curve id 9** is named by 237 assignments across three files from P6 6.0,
  7.0 and 24.12 and exported in none of them. It looks like a built-in curve
  P6 leaves out of the export. Those assignments are spread evenly, and the
  notes say so.
- Once actual hours are booked, the rest of an assignment is spread evenly,
  because how P6 re-fits a curve to the remaining units isn't known here.

The measurement is in
[`eval/resource-curves-2026-11-21.md`](../../ventures/xer-schedule-check/eval/resource-curves-2026-11-21.md).
Nothing is uploaded. The figures are estimates for review, not a substitute
for the scheduler's own P6 reports.
