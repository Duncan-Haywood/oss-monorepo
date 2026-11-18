---
title: "In Evanston, an hour cut off a shift the night before can cost four hours of pay"
seo_title: "Evanston Fair Workweek: what a late schedule change costs"
date: 2026-11-17
tags: [scheduling, fair-workweek, shift-roster-builder, labor-law]
description: "Shift Roster Builder's team hub now prices Evanston's Fair Workweek. Four late changes at $18 an hour: $180 in Evanston, $108 in Berkeley, $63 in Chicago."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) team hub keeps
a dated log of every change to a posted week. It prices each change under the
fair-workweek rule set the deployer picks. Until today that meant Seattle,
Oregon, Chicago, Philadelphia, Los Angeles, New York City, San Francisco,
Emeryville and Berkeley. Evanston, Illinois was the one place on the usual
lists without a preset. `FAIR_WORKWEEK=evanston` now adds it.

## What the rule looks like

Law-firm summaries of Evanston's ordinance (24-O-23) agree on these rules:

- Schedules are posted 14 days ahead.
- A change made with under 14 days' notice but more than 24 hours owes 1 hour
  of pay per changed shift.
- With under 24 hours' notice, cut hours or a cancelled shift owe **4 hours
  or the length of the scheduled shift, whichever is less**. Any other change
  owes 1 hour.
- Hours that start less than 11 hours after the previous shift ended are paid
  at time and a half, and the employee has to agree to them in writing.
- Changes the employee asks for are exempt. So are mutually agreed changes and
  events outside the employer's control. Agreeing to extra hours does not
  waive the pay, so offering a shift to the whole team doesn't make it free.

The first under-24-hour rule is the one that bites. Its cap is the length of
the shift, not the hours taken away. Emeryville uses the same reading.
Berkeley's ordinance sounds almost identical, but its FAQ caps the hours
actually taken away. So the same small cut costs four times as much in
Evanston as in Berkeley.

## Four changes, five cities

Here is one week with four late changes at $18 an hour, priced by the hub
(`eval/evanston-compare.mjs`):

| Change | Evanston | Berkeley | Emeryville | Chicago | Seattle |
|---|---:|---:|---:|---:|---:|
| 1 h cut off Monday's 8 h shift, Sunday 23:00 | $72.00 | $18.00 | $72.00 | $9.00 | $9.00 |
| Tuesday's 4 h shift cancelled, Monday 20:00 | $72.00 | $72.00 | $72.00 | $36.00 | $36.00 |
| 5 min added to Wednesday's end, Tuesday 22:00 | $18.00 | $0.00 | $0.00 | $0.00 | $18.00 |
| Thursday's 8 h shift cancelled 3 days ahead | $18.00 | $18.00 | $18.00 | $18.00 | $72.00 |
| **Total** | **$180.00** | **$108.00** | **$162.00** | **$63.00** | **$135.00** |

Three things stand out:

- **The night-before trim is the expensive row.** If a manager in Evanston is
  overstaffed tomorrow, sending someone home an hour early can cost more than
  keeping them on. The changes page shows that before you republish, not on
  payroll day.
- **No grace minutes.** None of the summaries mention a de minimis
  allowance, so the preset applies none. Five minutes added the evening
  before owes the hour, as in Seattle. Emeryville, Berkeley and Chicago let
  it go.
- **Early cancellations are cheap here.** Three days ahead, a cancelled
  8-hour shift owes 1 hour in Evanston. Seattle owes half the lost hours
  anywhere inside its 14-day window, which is four times as much.

## Where these numbers came from, and what is uncertain

This preset is weaker than the Berkeley, Emeryville and San Francisco ones,
which were read from the cities' own documents. This session's network
refused the city's site, the municipal code host and the ordinance PDF, so
the preset rests on search summaries of those pages and of law-firm alerts.
The hub's changes page says so. Four readings are open, and each one can be
changed with an environment variable:

- **What notice is counted to.** The preset counts to each changed shift. One
  alert counts to the first shift of the workweek (`FWW_NOTICE_FROM_WEEK=1`).
- **A shift moved to another day.** The preset prices it as two changes.
  `FWW_PAIR_DATES=1` makes it one.
- **The rest premium.** Most sources say 1.5x. One summary table lists 1.25x
  beside a 10-hour rule (`FWW_REST_MULT`).
- **When enforcement began.** Summaries give September 2023, January 2024 and
  a later postponement.

Which employers are covered, the right to decline hours, the offer of hours to
part-timers and the good-faith estimate at hire are not modelled. Everything
above is a planning estimate to check against the ordinance and the city's
current notice. It is not legal advice.

The preset, its tests (`notice-evanston.test.mjs`) and the comparison script
are in the [venture's README](../../ventures/shift-roster-builder/README.md),
under "Evanston".
