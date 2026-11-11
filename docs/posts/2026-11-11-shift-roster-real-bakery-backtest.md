---
title: "Shifts from sales, tried on a real bakery's till: three faults and a backtest"
seo_title: "Should staffing forecasts weight recent weeks? A real-bakery backtest"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "A real bakery POS export showed three faults in the free shift planner. A 38-week backtest found a 4-week half-life beats a plain average."
---

The [shift roster builder](../../ventures/shift-roster-builder/) has a
[shifts-from-sales page](../../ventures/shift-roster-builder/shifts-from-sales.html).
You paste an hourly sales export from a till. It averages each weekday-hour,
divides by your sales per labor hour, and cuts the result into shifts. Paid
schedulers (7shifts, Deputy, Planday) sell this step as "forecasting". Until
today it had only seen sales we made up.

Today it read a real one: a Korean bakery's order file, published on Kaggle
as "Bakery Sales" by the user hosubjeong. It holds 2,420 orders from July
2019 to May 2020, with a timestamp, a weekday and a total in won on each row.
The file parsed with no edits. The plan it made had three faults.

## What the real file showed

1. **233 empty rows.** The file ends in rows of bare commas. Each one was
   reported as "could not read the date and hour": 233 lines of noise above
   the answer. Empty rows are now ignored, with one note.
2. **A closed day got staffed.** The bakery is shut on Tuesdays, except one:
   Christmas Eve. The tool averaged each weekday over the dates it traded,
   so that one Tuesday became every Tuesday, with two people from 11:00 to
   15:00. Now a weekday with sales on fewer than 1 in 4 of its dates is
   treated as closed, and a note says so.
3. **One late order, one midnight shift.** One order at 22:00 (1 of 39
   Wednesdays) and one at 23:00 (1 of 42 Sundays) stretched the trading day,
   so the plan added shifts to 23:00 and midnight. An edge hour that sees
   sales on fewer than 1 day in 20 no longer sets the opening or closing
   time.

At 30,000 won of sales per labor hour, the weekly plan drops from 101
scheduled hours to 82. `--keep-rare` turns both rules off.

## Does weighting recent weeks help?

The tool already had a half-life option: recent weeks count more in the
average. Nobody knew whether to use it. So the page now has a **Test on my
past weeks** button, and the CLI has `--backtest`. For every full week after
the first four, it plans the week using only the weeks before it, as you
would on a Sunday night. Then it compares that plan, hour by hour, with the
staff that week's real sales needed. **Short** is person-hours the sales
needed and the plan lacked. **Over** is staffed hours beyond the need.

On the bakery's 38 tested weeks, at 30,000 won per labor hour and at least
one person on:

| Method | Short | Over | Scheduled | vs plain average (95% CI) |
|---|---|---|---|---|
| plain average (default) | 14.2 | 11.6 | 65.0 | |
| half-life 8 weeks | 14.0 | 10.7 | 64.2 | -1.1 (-1.7 to -0.5) |
| half-life 4 weeks | 13.9 | 10.4 | 64.1 | -1.5 (-2.3 to -0.7) |
| half-life 2 weeks | 14.2 | 10.6 | 63.9 | -0.9 (-2.0 to 0.1) |
| last 4 weeks only | 14.5 | 11.5 | 63.6 | +0.2 (-1.1 to 1.5) |
| last week only | 19.1 | 14.3 | 56.4 | +7.6 (5.6 to 9.7) |

All figures are person-hours per week. We tried six settings: 15,000, 30,000
and 60,000 won, each with a minimum of one or two staff. A 4-week half-life
beat the plain average at every one, by 0.3 to 2.6 person-hours a week. At
the busiest setting a 2-week half-life edged it. Planning from last week
alone was worst every time, by 5 to 14 person-hours. That is the "copy
last week's schedule" habit many small shops have.

The bigger number is the first column. Even the best average leaves about
14 person-hours a week short against 64 scheduled, because sales in any one
hour swing more than any choice of average can track. A gain of one or two
hours a week from weighting is real, but it is small next to that swing.

## Limits

This is one shop. The test scores headcount per hour, before the cut into
shifts, and it costs an hour short the same as an hour over. The
intervals treat weeks as independent, which they are not quite. The data
file is not in the repository: its licence page could not be read from the
session that ran this, so `eval/bakery-backtest.mjs` downloads a public
mirror and checks its SHA-256 before it runs. Next is a US or European POS
layout, and a setting that charges a short hour more than an over hour.

Nothing you paste on the page leaves your browser. Not legal or financial
advice. Built by AI coding agents with the repository owner steering.
