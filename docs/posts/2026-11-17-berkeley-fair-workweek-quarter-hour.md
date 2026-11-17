---
title: "Berkeley's fair workweek, read from the city's FAQ: a 15-minute cut owes a quarter hour"
seo_title: "Berkeley Fair Workweek predictability pay, priced change by change"
date: 2026-11-17
tags: [scheduling, shift-roster-builder, fair-workweek, berkeley]
description: "Shift Roster Builder's team hub now prices Berkeley's predictability pay from the city's own notice and FAQ, which differ from Emeryville's on cuts."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) team hub logs
every change to a posted week and prices it under a city's predictive-scheduling
rules. It already had presets for eight places. Berkeley, two miles from
Emeryville, is now the ninth (`FAIR_WORKWEEK=berkeley`). Its numbers come from
the city's own [official notice](https://berkeleyca.gov/sites/default/files/documents/Fair%20Workweek%20Public%20Notice_City%20of%20Berkeley_January%202024%20%28English%29.pdf)
and [FAQ of 2024-08-23](https://berkeleyca.gov/sites/default/files/documents/Fair%20Workweek%20FAQ_Rev.08.23.24.pdf),
both fetched from berkeleyca.gov in this session. The municipal code itself
(BMC 13.102) returned 403, so we didn't read the code text.

## Same table, different arithmetic

Berkeley's notice prints a pay table that looks almost exactly like Emeryville's:
1 hour of pay for any change made with under 14 days' notice, and under 24 hours
"4 hours of predictability pay or the number of cancelled or reduced hours in
the employee's scheduled shift, whichever is less".

The difference is in that last clause. Emeryville's pay-structure sheet counts
the scheduled shift's hours, so taking one hour off an 8-hour shift the evening
before owes 4 hours there. Berkeley counts the hours taken away, and FAQ 14 says
so outright: an employee cut 15 minutes early is owed 15 minutes. The pricer
had no rule of that shape, so it gained one, a `cutLostCap` on a notice tier.
The FAQ's example is now a test: 9:00-17:00 cut to 16:45 the night before, at
$20 an hour, owes $5.

## Two smaller rules

- **The grace period is for each end.** FAQ 17 lets an employee start up to 10
  minutes early and finish up to 10 minutes late without predictability pay.
  The old threshold summed the two ends, so 10 minutes early plus 10 late would
  have counted as 20 minutes and owed an hour. A new `extendEach` flag applies
  it to each end separately. The grace covers time added, not time cut.
- **A shift moved to another date is one change.** The hub logs a shift moved
  from Thursday to Friday as a cancellation plus an addition, which priced it
  at 2 hours. Berkeley's table lists "moves shifts to another date or time" as
  one change at 1 hour. Only the New York City preset paired the two before
  this. The pairing is now a flag any preset can set, and it also works when
  the staff list has no wage, where it used to be skipped.

## What we read one way and flag

The notice and FAQ count rest from "the end of the previous shift". Taken
literally, a same-day split shift with a 4-hour break puts its whole second
piece inside the 11-hour rest window at time and a half. The preset follows the
text, and `FWW_REST_ACROSS_DAYS=1` turns it off if the code's definition of a
shift says otherwise. A shift that is both moved and shortened under 24 hours
owes the greater of the move's hour and the cut's pay. The FAQ doesn't say
whether the two stack, so the reading that never pays twice is the one we chose.
Who is covered isn't modelled: 10 or more employees in Berkeley, plus 56 or 100
worldwide depending on industry.

None of this is legal advice. The changes page names its sources so a manager
can check them against BMC 13.102. The README's "Berkeley" section has the full
table, and `notice-berkeley.test.mjs` turns each FAQ example into a test.
