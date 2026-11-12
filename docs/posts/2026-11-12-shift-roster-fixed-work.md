---
title: "Wiping tables doesn't scale with customers: fixed work in a staffing plan"
seo_title: "Fixed and variable labour standards for small-shop staff schedules"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "Fixed minutes every trading hour, at opening and at closing. Added as fixed work, not a slower rate, the same extra work staffed the ends of a bakery's day."
---

[Shifts from your sales](https://marisstella.app/shift-roster-builder/shifts-from-sales.html) turns a till or POS export into the shifts a shop needs. Since this morning it can plan from a *labour standard*: the minutes each ticket, each euro and each item take, added up hour by hour. Paid workforce tools plan this way too.

Some of a shop's work doesn't grow with customers, though. Someone wipes the tables and restocks the fridge every hour. Someone sets up before the first customer and cleans down after the last. Until now the only way to allow for that here was a slower rate: `--splh 45` says a person does 45 minutes of customer work an hour, which leaves a quarter of each hour for everything else.

## What changed

The standard now takes fixed terms beside the variable ones:

```
--standard "1.5/ticket + 10/hour + 30/open + 45/close"
```

- `10/hour` is 10 minutes in every hour the shop trades.
- `30/open` is 30 minutes in the first trading hour of each day.
- `45/close` is 45 minutes in the last trading hour.

The same box on the page takes the same text. A trading hour is any hour with at least one sale in the file, so an hour the shop was open with nobody buying gets no fixed work. The minimum staff setting covers those hours.

## Does a rate or a fixed term make a difference?

We ran it on a real French bakery's till file (136,451 tickets over 600 trading days) with 6 minutes of work a ticket. Then we added a quarter more work in two ways:

| A quarter more work, added as | Hours a week | Before 10:00 | 10:00-14:00 | From 14:00 | First hour of the day | Last hour |
|---|---|---|---|---|---|---|
| nothing (tickets only) | 184 | 58 | 98 | 28 | 7 | 8 |
| a slower rate (`--splh 48`) | 230 | 68 | 114 | 48 | 7 | 8 |
| fixed minutes every hour | 232 | 70 | 114 | 48 | 13 | 13 |

The first and last hour columns are person-hours summed over the week, so 7 means one person every day.

Both versions cost about the same, and they split the day about the same way. The difference is at the edges. A rate scales the allowance with customers, so the quiet first and last hours get almost none of it. The fixed version puts a second person there on most days. That is where a lot of shops really do need one: the bake-off before opening and the clean-down at night.

Moving work instead of adding it shows the same pull. Take a quarter of the work away from tickets and make it 36.8 fixed minutes an hour, with the total held the same. The plan grows from 184 to 202 hours a week, and the afternoon gains 20 of them. In a quiet hour, a steady load is enough to tip a half-busy shop into needing a second person.

## What we can't tell you

The backtest score drops from 41.7% to 33.9% of scheduled hours when a quarter of the work is fixed. That isn't a better plan. Fixed work is as predictable as the opening hours, so the target simply gets easier to hit. The right minutes come from your own task list or a stopwatch at the counter, and no file we have holds either. This is one shop, and the minutes were swept, not measured.

The code, the test file and the full output are in the [repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) (`eval/fixed-work.mjs`). The tool is free, runs in your browser and needs no sign-up. Its numbers are estimates from your own file, not advice.
