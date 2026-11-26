---
title: "Filling a WH-347 certified payroll from your timesheet export, day by day"
seo_title: "WH-347 certified payroll from a timesheet or payroll CSV: hours by day, 7A and 7B"
date: 2026-11-26
tags: [for-customers, payapps, construction, certified-payroll, davis-bacon, prevailing-wage]
description: "The WH-347 wants hours per day, straight time and overtime apart, and gross for this job and for all work. What your payroll export has to carry for each, and the mistakes it can make for you."
---

*Written by an AI agent working in this repository. Not legal or payroll advice: check every
figure against your payroll records, and sign only what you know to be true.*

On a Federal or federally assisted job, a contractor or subcontractor sends a certified payroll
every week (29 CFR 5.5(a)(3)(ii)). The Department of Labor's optional Form WH-347 (Rev. January
2025) lays it out, and most GCs ask for it, or for a document with the same columns, with the pay
application. Most of that form is copied from payroll records, by hand, every week.

We built a way to fill it from a CSV instead, in PayApps, the pay-application product we are
building for specialty subcontractors. Writing it showed which parts of a payroll export can be
trusted to fill the form, and which parts it gets wrong unless someone checks.

## What the form needs, and where it comes from

| WH-347 column | What goes in it | What your export must carry |
|---|---|---|
| Hours each day (ST and OT rows) | Hours on each of the seven days ending on the week-ending date | One row per worker **per day**, with a work date |
| Straight time vs overtime | Separate rows on the form | A regular-hours column and an overtime column |
| 7A, gross for this project | What the payroll paid for this job | Gross pay, tagged by job |
| 7B, gross for all work | 7A plus anything the worker earned on other jobs that week | Every job's rows for the week, not just this one |

## Four ways an export goes wrong

**1. It is by pay period, not by day.** A payroll register usually has one row per worker per pay
date. Fill a WH-347 from that and the whole week lands on the pay date: 40 hours on a Friday. Export
a timesheet or a time-by-day report instead. PayApps flags any day over 24 hours and says why.

**2. Its overtime column may already be counted.** Some exports have "Hours" and "Overtime hours"
with no "Regular hours" column, and do not say whether Hours already includes the overtime. A
tool that guesses either way gets the week wrong. PayApps refuses that pair and asks for a
regular-hours column. With a single hours column, every hour goes in as straight time, and the
form's own check flags more than 40 straight-time hours in the week.

**3. Double time has nowhere to go.** The WH-347 has a straight-time row and an overtime row. Double
time at twice the rate belongs on a row of its own, so PayApps lists those hours rather than adding
them to either row.

**4. 7B comes from the other jobs.** If the export is filtered to one job, 7B cannot be known from
it. Export every job for the week and pick this job: the job's rows fill the hours and 7A, and all
the rows together fill 7B, but only when they add up to more than 7A.

## What it does not fill

Classifications, rates and IDs are not filled. A wage determination classification is a judgment
about the work, not a column in payroll. A worker who did two kinds of work that week needs the
hours split by classification, which a timesheet rarely carries. So workers already on the form
keep what you typed, a worker with two classification rows is left for you to split, and a new
worker comes in with blank classification and rates for the form to ask for.

The CSV is read in your browser and is never uploaded. That is the same rule the certified payroll
page already follows for workers' names and ID numbers.

## Where this lives

PayApps is in development with early access, and nothing is for sale yet:
[construction tools and early access](https://marisstella.app/industries/construction/). The free
guides, including [how to fill out a pay application](https://marisstella.app/pay-app-guides/how-to-fill-out-a-pay-application.html)
and what to attach to one, are at [pay-app guides](https://marisstella.app/pay-app-guides/).
