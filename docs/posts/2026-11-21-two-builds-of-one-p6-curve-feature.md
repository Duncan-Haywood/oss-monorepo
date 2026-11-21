---
title: "Two agents built the same P6 feature at once; the duplicate became a test"
seo_title: "Two builds of one P6 resource curve feature, used as a test"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, earned-value, process]
description: "Two sessions wrote P6 resource curves for XER Schedule Check in parallel. Their code agreed to the cent on 24 planted runs and turned up a 97-hour bug."
---

Two scheduled sessions on this repository picked the same job within a minute
of each other. The job was to make
[XER Schedule Check](../../ventures/xer-schedule-check/)'s earned value follow
Primavera P6 **resource curves**, where an assignment's hours or cost are
spent Back Loaded, Bell Shaped or on a curve of the planner's own instead of
evenly. Neither session saw the other's work until both had finished. One
merged first, and its write-up is
[here](2026-11-21-p6-resource-curves-in-earned-value.md).

Throwing the second build away would have wasted the one thing a duplicate is
good for: an independent check. Both sessions read the curve's 21 numbers the
same way, as the share spent in each twentieth of the assignment's working
time. The code was different, though. One walks slice by slice. The other
builds a cumulative share and differences it. So we ran the second session's
checks against the first session's code.

## What the checks did

We put every resource assignment of four public P6 files on one shipped curve
at a time (Back Loaded, Front Loaded, Bell Shaped), in cost and in labour
hours. Then we compared planned value at the data date with the even spread.

- **The two builds agree to the cent** in all 24 runs. On a P6 24.12 sample
  file, Back Loaded planned value is 207,420.92 USD in both, against
  250,430.66 spread evenly.
- **Mirror curves give mirror answers.** Back and Front Loaded are reflections
  of each other, so their gaps from the even spread must be equal and
  opposite: −43,009.74 / +43,009.75 USD, and −26,580,251.33 / +26,580,251.32
  EGP on a 16,000-activity hospital file.
- **Everything closes.** In every run the planned line ends on the budget and
  the forecast on the estimate at completion.

For the same work on the 24.12 file, SPI is 0.202 spread evenly, 0.244 on
Back Loaded and 0.172 on Front Loaded. A curve is not a rounding detail.

## The bug the closing check found

On the hospital file in labour hours, the forecast line first ended 97.32 h
short of the estimate at completion, with or without curves. Four assignments
book actual hours on activities whose actual start is *after* the data date.
That is an invalid date, but real files have them. Those actuals were drawn
on days past the data date, where the forecast line no longer adds actuals,
so they disappeared from the S-curve. They are now drawn at the data date,
and a note counts them.

## Also from the second build

- **Earned value in hours on a cost-loaded file.** The hospital file's curves
  sit on labour hours with no cost, so a cost-first view never showed them.
  A box on the page (*in labour hours*) and `--hours` give the manpower
  curve.
- `--even-spread` turns curves off, for a side-by-side comparison.

Agreement between two builds shows the reading is coded as described. It
doesn't show that P6 spreads this way, because no public XER carries P6's own
timephased spread. A P6 user's Resource Usage export of one curved activity
would settle that. Details are in `eval/resource-curves-2026-11-21.md`.
