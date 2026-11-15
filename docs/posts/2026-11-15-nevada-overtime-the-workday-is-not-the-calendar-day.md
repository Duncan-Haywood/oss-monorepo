---
title: "Nevada overtime: the workday is not the calendar day"
seo_title: "Nevada daily overtime and the 24-hour workday, in a free timesheet"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, payroll, labor-law]
description: "The free team hub's timesheet now reads Nevada's 24-hour workday and the meal-period rules of 13 more states, from the statute and the DOL tables."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) team hub got a
time clock this morning and a pay estimate this afternoon. The pay estimate
knew four rule sets: federal, California, Alaska and Colorado. Its README
said Nevada was "left out rather than guessed". This evening I read the text
and added it.

## The clopen that costs eight hours

Nevada's overtime statute, NRS 608.018, pays time and a half over 8 hours in
a workday. That applies to anyone paid less than one and a half times the
state minimum wage. The minimum is $12.00, so the line is $18.00 an hour.
Above the line, only the 40-hour week counts.

The part that matters is one line further on. NRS 608.0126 defines a
workday as "a period of 24 consecutive hours which begins when the employee
begins work". It does not mean the calendar day.

Take a closer who works Monday 14:00 to 22:00 and opens Tuesday 06:00 to
14:00. That is 8 hours on each calendar day, so a spreadsheet counts no
overtime. In Nevada both shifts fall inside the one workday that began at
14:00 on Monday. That is 16 hours, and 8 of them are overtime. The Alaska
rules count the same punches by calendar day and owe nothing. The timesheet
now does it Nevada's way.

It also covers the statute's exception. A mutually agreed schedule of four
10-hour days is exempt. The tool can't see an agreement in the punches, so
the manager turns it on with a setting (`NV_FOUR_TENS=1`).

## Thirteen more states' meal breaks

The Department of Labor keeps a table of state meal-period laws (revised
January 2023). Most of them are mechanical enough to check from clock-outs:

- Washington wants 30 minutes between hours 2 and 5.
- Connecticut and Delaware want it after the first 2 hours and before the
  last 2.
- Illinois wants 20 minutes within 5 hours on a 7.5-hour shift.
- Rhode Island wants 20 minutes at 6 hours and 30 at 8.

There are thirteen in all, and each became a few lines of data. Only
California and Puerto Rico attach a premium to a missed break, so in the
other states the result is a flag, not money. Each state's exceptions that
the punches can't show get a note instead of a guess, like New Hampshire's
"unless the employee may eat while working".

Reading the DOL's overtime table to confirm "no daily overtime in these
states" turned up one I had wrong. Kentucky pays time and a half for the
seventh day when someone works all seven days of a week. Six 6-hour days
and a 6-hour Sunday come to 2 hours of overtime federally and 6 in Kentucky.
That rule is in too.

## One invented week, eighteen rule sets

I put four invented people through every rule set:

- an opener who takes lunch at 4 hours;
- a closer with the clopen above and 20-minute breaks;
- a $24 lead on four 10-hour days who eats at hour 6;
- a part-timer on 6.5-hour shifts with no break.

Overtime is 9 hours federally and 17 in California, Alaska and Nevada, by
different routes. Nevada's 8 are the closer's clopen. Alaska's 8 are the
lead's 10-hour days, which Nevada leaves to the weekly rule because $24 is
above the line. Meal flags run from 0 under federal rules to 12 in
Washington, Kentucky, New Hampshire and California. The figures are in
`eval/pay-rules-by-state.out.txt`.

## What it isn't

No employer in any of these states has run it yet. No labour office or
lawyer has checked my readings, and the DOL table itself says to consult the
state. Where the table's words leave a window open ("between 3rd and 5th
hour"), I read it on the wide side, so a flag means the punches plainly
miss. It is an estimate to check before payroll, not legal advice. It does
make the free hub useful past four states, at a step that paid schedulers
usually sell as a compliance add-on.
