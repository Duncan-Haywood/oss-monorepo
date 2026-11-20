---
title: "Earned value from a P6 XER, and a hospital schedule whose CPI of 1.000 means nothing"
seo_title: "Earned value and S-curve from a Primavera P6 XER file"
date: 2026-11-20
tags: [construction, scheduling, primavera-p6, xer, earned-value]
description: "XER Schedule Check now computes earned value, earned schedule and an S-curve from a cost-loaded P6 export, and checks the cost loading before you pay on it."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a Primavera P6
`.xer` export in the browser and runs the DCMA 14-point assessment. Its
recomputed dates match the ones P6 stored on 19,820 of 19,822 activities. As
of today it also reads the cost.

## What it computes

Many contracts ask for a cost-loaded schedule: each activity carries its share
of the contract value, and the monthly pay application is tied to progress on
it. The XER holds everything needed to check that:

- the **budget**, **actual** and **remaining** cost on every resource
  assignment (P6's `TASKRSRC` table), plus project expenses;
- each activity's **percent complete** and how it is measured (physical,
  duration or units);
- the **planned dates** and the logic.

From those the new "Earned value and the S-curve" section gives planned value
to the data date, earned value, actual cost, SPI, CPI, TCPI, three estimates at
completion, and earned schedule. Earned schedule's SPI(t) is the schedule
index that does not drift back to 1.0 at the end of a late job. You also get a
monthly S-curve (planned, actual, then the forecast over the dates the engine
recomputes from the logic), a breakdown by WBS, and a CSV of every activity.
If no cost is loaded but labour hours are, it does the same in hours. The
command line does the same with `node cli.mjs schedule.xer --earned-value`.

## The checks that matter before paying

The numbers are only as good as the cost loading, so it also lists the
activities behind each common fault:

- open work with no budget (it earns nothing, so the total misses it);
- cost booked on work that has not started;
- remaining cost left on finished work;
- progress claimed with nothing spent;
- value earned at more than 1.5 times what was spent (how a front-loaded
  claim shows up);
- overruns;
- remaining cost far below the budget still to be earned;
- **actuals that equal earned value on nearly every activity.**

## A real file where the last check fires

We ran it on the public XER files the engine is tested against
([eval note](../../ventures/xer-schedule-check/eval/earned-value-2026-11-20.md)).
One is a 16,000-activity hospital schedule exported from P6 6.0, with
632.6 million (EGP) of budget on its assignments. Its headline figures look
excellent: 70% earned against 52% planned, SPI 1.34, CPI 1.000.

That CPI is exact, and that is the giveaway. On all 2,020 cost-loaded
activities with actuals, actual cost equals budget times percent complete to
within 0.1%. P6 can fill in actuals from progress ("auto compute actuals"),
and this file was built that way. So the CPI says nothing about cost
performance. A reviewer should ask for the cost ledger, and the tool now says
so. The match also checks our side of the arithmetic: the percent complete the
tool reads agrees with the one P6 applied on all 2,020 activities.

Two more things stand out in the same file. 12,352 open activities carry no
cost at all. And the SPI of 1.34 sits beside a logic-driven forecast finish
of June 2013. Earned schedule puts the finish around September 2012. That gap
suggests the planned dates were moved along with the schedule, which P6 does
for work that has not started. An XER export carries no timephased baseline,
so planned value can only follow the dates in the file. The page says this
next to the result.

A public expressway file shows a different fault. Its 21 budgeted activities
are all unstarted, and they hold 111,528 (OMR) of budget but only 669 still to
complete. Any estimate at completion built on that file comes out at 0.6% of
the budget.

## Limits

No public file carries P6's own earned value columns, so planned value is
checked only for consistency: the curve ends on the budget, and the forecast
ends on the estimate at completion, in every file. The 0/100, 50/50 and
fixed-percent techniques are unit-tested but none of the public files uses
them. As with everything on the page, the file stays in your browser.
