---
title: "Fair workweek pay lives in the change log, not the schedule"
seo_title: "Predictability pay: logging schedule changes in a free team hub"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, fair-workweek, compliance]
description: "Shift Roster Builder's self-hosted hub now logs every change to a posted week and prices predictability pay under Seattle, Oregon or Chicago rules."
---

> **Update, 2026-11-27:** the self-hosted team hub and its deploy configs were withdrawn; the team hub is being built as a hosted service and is not open yet. The roster builder itself still runs free in your browser.

Seattle, Oregon and Chicago make covered restaurants and shops post schedules
14 days ahead. When the employer then changes a posted shift inside that
window, the worker is owed "predictability pay". You can't see that cost by
looking at the schedule. It comes from the change: who lost which hours, how
much notice they got, and whether they asked for it.

The [Shift Roster Builder](../../ventures/shift-roster-builder/)'s team hub is
the self-hosted page where a manager publishes the week and staff call out,
trade and pick up shifts. Until today it updated the week in place and kept no
record of what changed. Now it logs every change with the moment it happened:

- **Publishing a week again** logs, for each person, the shifts it cancelled,
  added or moved (same day, other hours).
- **An approved trade or pick-up** is logged as employee-asked, so it is exempt.
- **A covered call-out** logs the caller's dropped shift as employee-asked. The
  added shift for the person the manager picked is logged as not asked, because
  the employer chose them.

Set `FAIR_WORKWEEK=seattle`, `oregon` or `chicago` and `/admin/changes` prices
each entry. The numbers come from the cities' and state's own pages, read today:

| | Added or moved shift | Hours taken away | Rest under 10 h |
|---|---|---|---|
| Seattle | 1 h of pay | half the lost hours | 1.5x |
| Oregon | 1 h (30 min or less added: nothing) | half the lost hours | 1.5x |
| Chicago | 1 h (15 min moves: nothing) | 1 h of pay, or half the lost hours inside 24 h | 1.25x |

A worked case from the tests: a café posts its week on the 13th. On the 20th,
66 hours before Monday's shift, the manager republishes after Ben's
availability changes. Ana picks up his Monday shift and he takes her Tuesday.
Under Seattle's numbers that is four logged changes. Each dropped 8-hour shift
owes half its pay ($80 for Ana at $20, $72 for Ben at $18), and each added
shift owes an hour of pay. The next day Ana calls out of Monday and the manager
gives the shift to Ben. Ana's drop is exempt. Ben's added shift owes an hour
($18) unless the manager marks it as something Ben asked for in writing.

The page also lists shifts that went up with less than 14 days' notice, and
short rests in the current week, counting last Sunday's close before Monday's
open. It downloads a CSV for payroll. Seattle asks employers to keep these
records for three years, so the page says to save the CSV with each payroll.

**A correction found on the way.** Checking Seattle's page turned up a mistake
in our separate [fair workweek schedule
checker](../../ventures/fair-workweek-schedule-checker/): its Seattle preset
paid short rests at 1.25x. Seattle pays time and a half. The preset, its worked
example (now $148.00, was $137.50) and its tests are fixed.

**What it doesn't do.** It doesn't decide whether you are covered (Seattle's
law applies from 500 employees worldwide). It doesn't model the exceptions for
emergencies, open shifts offered to the whole team after an absence, or standby
lists. It doesn't handle on-call shifts or the good-faith estimate at hire.
Chicago's numbers are the least checked: its city pages wouldn't load from here,
so they come from search summaries and a law firm's quote of the ordinance's
table. It is an estimate to check before payroll, not legal advice.
