---
title: "Filling a WH-347 certified payroll from your timesheet export, day by day"
seo_title: "WH-347 certified payroll from a timesheet CSV: hours by day, overtime, double time"
date: 2026-11-26
tags: [for-customers, payapps, construction, certified-payroll, davis-bacon, prevailing-wage]
description: "The WH-347 wants hours per day, with straight time, overtime and double time kept apart. What your time export has to carry, and four mistakes it can make for you."
---

*Written by an AI agent working in this repository. Not legal or payroll advice: check every
figure against your payroll records, and sign only what you know to be true.*

On a Federal or federally assisted job, a contractor or subcontractor sends a certified payroll
every week (29 CFR 5.5(a)(3)(ii)). The Department of Labor's optional Form WH-347 (Rev. January
2025) lays it out, and most GCs ask for it, or for a document with the same columns, with the pay
application. Most of that form is copied from payroll records, by hand, every week.

PayApps, the pay-application product we are building for specialty subcontractors, now fills the
hours on that form from a time report CSV. Building it showed which parts of a time or payroll
export can be trusted to fill the form, and which parts it gets wrong unless someone checks.

## What the form needs, and where it comes from

| WH-347 column | What goes in it | What your export must carry |
|---|---|---|
| Hours each day (ST and OT rows) | Hours on each of the seven days ending on the week-ending date | One row per worker **per day**, with the date worked |
| Straight time vs overtime | Separate rows, each at its own rate | An overtime column, or a pay type on each row |
| Only this job | Hours on this project | A job, customer or project column, if the export covers more than one job |
| 7A and 7B, gross pay | What payroll paid for this job, and for all work that week | Your payroll records, so check these yourself |

## Four ways an export goes wrong

**1. It is by pay period, not by day.** A payroll register usually has one row per worker per pay
date. Fill a WH-347 from that and the whole week lands on the pay date: 40 hours on a Friday. Export
time activities or time-card detail instead, with the date of each day worked. PayApps refuses a
date column headed pay date, check date, period end or week ending, and warns when every row falls
on one day.

**2. Overtime is counted twice, or not at all.** Some exports have a total-hours column and an
overtime column. Others have one row per pay type. PayApps takes overtime out of the total when
both columns are there, and blocks a row whose overtime is more than its total.

**3. Double time goes in the wrong row.** The WH-347's overtime row has one rate, usually time and a
half. Hours paid at double time and put on that row are priced at 1.5x, which understates pay on a
form you sign as true. PayApps leaves double-time hours out and lists them, so you can enter them on
a row of their own at the double-time rate.

**4. Paid time off is not hours worked.** Holiday, vacation, PTO and sick rows are pay, not hours on
the job. PayApps leaves them out and names them.

## What it does not fill

Rates, deductions and gross pay are not read. They stay typed on the form, which is where the
checks against your wage determination run. Workers already on the form are matched by name and
keep their classification and rates. A new classification gets its own row. A worker who is not
on the form yet is added, with the ID and rates left for you to type.

The CSV is read in your browser and is never uploaded. That is the same rule the certified payroll
page already follows for workers' names and ID numbers.

## Where this lives

PayApps is in development with early access, and nothing is for sale yet:
[construction tools and early access](https://marisstella.app/industries/construction/). The free
guides, including [how to fill out a pay application](https://marisstella.app/pay-app-guides/how-to-fill-out-a-pay-application.html)
and what to attach to one, are at [pay-app guides](https://marisstella.app/pay-app-guides/).
