---
title: "P6 resource curves in earned value: what a Back Loaded curve does to SPI"
seo_title: "Primavera P6 resource curves and earned value from an XER"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer, earned-value]
description: "XER Schedule Check now spreads planned value by each assignment's P6 resource curve. On a public 24.12 file, one curve choice moves SPI from 0.17 to 0.24."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) computes earned
value from a Primavera P6 `.xer` export in the browser: budget, planned,
earned and actual cost, SPI, CPI and the S-curve. Until today it spread every
assignment's budget evenly over its planned dates. P6 doesn't always do that.
A planner can put a **resource curve** on an assignment, such as Back Loaded,
Bell Shaped, Front Loaded or a curve of their own, and P6 then spends the
units and cost unevenly. An even spread gets planned value, SPI and the
S-curve wrong for those assignments.

## What the XER holds

The curves travel in the `RSRCCURVDATA` table as a name and 21 numbers, and
each assignment points at one with `TASKRSRC.curv_id`. A public P6 6.0
hospital schedule carries six curves: P6's five shipped ones and one of the
planner's own ("PCO119", a late bell). In every one of them the first number
is 0 and the other twenty add up to exactly 100. "Linear" is 0 followed by 5
twenty times. So point *k* is the share spent in the *k*-th twentieth of the
duration. The tool now reads them that way, over the assignment's working
time on the activity's calendar.

## Does it matter?

On the real files, barely, and the reason is worth knowing. The hospital
file's data date falls before every curved assignment starts, so planned
value at the data date doesn't change. On the S-curve its 34 curved
assignments shift the planned line by at most 0.45%. The 24.12 example file
and a 7.0 expressway file have 236 assignments on a curve with id 9, but
neither file includes curve 9 in its export. The tool names those assignments
and spreads them evenly.

To see what a curve can do, we put every assignment of a file on one curve
in turn and recomputed. On the 24.12 file, planned value at the data date is
250,431 USD spread evenly, 207,421 Back Loaded and 293,440 Front Loaded, so
**SPI is 0.244 or 0.172 for the same work**. A reviewer comparing the tool's
SPI with the contractor's P6 report would see a gap that size and wonder
which one is wrong.

Two checks back the arithmetic. Back and Front Loaded are mirror images, so
their gaps from the even spread should be equal and opposite: they are
(−43,009.74 and +43,009.75). On all four files with assignments, in cost and
in hours, the planned curve ends on the budget and the forecast on the
estimate at completion in 24 of 24 runs.

## A bug the check found

The closing check failed once at first. On the hospital file the forecast
curve in labour hours ended 97.32 h short. Four assignments book actual hours
on activities whose actual start is *after* the data date. That's an invalid
date in the file, and those actuals were drawn after the point where the
forecast stops adding actuals. They are now drawn at the data date, with a
note naming how many.

## Also new

- **Earned value in hours on a cost-loaded file.** The hospital file's
  curves sit on labour hours with no cost, so a cost-first reading never
  reached them. A box on the page (*in labour hours*) and `--hours` on the
  command line give the manpower curve.
- `--even-spread` turns curves off, for comparison.

## What this does not show

We haven't compared the tool's spread with P6's own. P6 computes the
timephased spread on screen and the XER doesn't carry it. A spreadsheet
export of a curved activity's planned units from P6 would settle the detail
inside each twentieth. How P6 treats a curve on an activity already under way
may also differ from the rule used here, which follows the rest of the curve
from the share of the duration already done. The method and every figure are
in `eval/resource-curves-2026-11-21.md`.
