---
title: "Two closers on Friday, one on Tuesday: a lock-up rule by weekday"
seo_title: "Lone-worker rule for closing shifts by day of the week"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "A two-to-lock-up rule every night cost a real bakery 45 staff hours a week. On Friday and Saturday only it cost 10."
---

Earlier today [Shifts from your sales](https://marisstella.app/shift-roster-builder/shifts-from-sales.html) learned a lone-worker rule: "Staff with the doors shut" set to 2 means nobody opens or locks up alone. It was one number for the whole week.

Lone-worker rules don't usually work like that. Locking up alone at 17:00 on a quiet Tuesday is a different job from locking up at 23:00 on a Saturday, after the bars let out. Plenty of shops ask for two closers on the late nights and leave it to one person the rest of the week. Putting two on every night costs real money for the nights nobody is worried about.

## What changed

The same box (and `--shut-min` on the command line) now takes a minimum for each weekday:

```
--shut-min "1, Fri/Sat=2"
```

That is one closer Monday to Thursday and on Sunday, and two on Friday and Saturday. Day names and ranges work the way they do in staff availability, so `Fri-Sun=2` and `daily=2, Sun=1` work too. A day you don't name keeps the default, and a plain `2` still means every day.

Each day's number goes everywhere the single number did:

- **who does the shut-door work.** Two people on Friday clear 90 minutes of cleaning in one hour. One person on Monday stays two hours.
- **the floor in those hours.** The planner never staffs a shut-door hour below that day's minimum.
- **the shift cutter.** The planner weighs whether a short stretch of extra cover is worth a 4-hour shift. A second closer on Friday is a rule, not a cost, so it is never dropped, even when an hour short is priced cheap.
- **the backtest.** "Test on my past weeks" scores each weekday against its own minimum, so the plan and the scoring use the same rule.

## What it costs on a real bakery

The test file is a public French bakery's till export (232,711 item lines over 600 trading days). The settings were 6 minutes a ticket, 30 minutes before opening, 45 after closing, minimum staff 1 and 4-to-8-hour shifts. Those minutes are a sweep, not this bakery's real closing routine.

| Doors-shut minimum | Scheduled hours a week | Second closer on |
|---|---|---|
| 1 every day | 198 | none |
| 2 every day | 243 | every night |
| 1, Fri/Sat=2 | 208 | Friday, Saturday |
| 1, Sat/Sun=2 (its busiest two days) | 208 | Saturday, Sunday |

A two-person rule on every night adds 45 staff hours a week. Most of that comes from the 4-hour shortest shift: the second closer has to be booked for 4 hours to do 45 minutes of shut-door work. Keeping the rule to two nights costs 10 hours. At $15 an hour, that is about $35,000 a year against $7,800.

The backtest (each week planned from earlier weeks only) moves with the hours. Two every night was 36.4 hours short and 52.0 spare a week. One every night was 44.5 short and 30.6 spare. Friday and Saturday only landed in between, at 41.8 and 38.1. The extra closer also covers the last trading hours, which is why "short" drops as well.

The script and its output are in the repository: `ventures/shift-roster-builder/eval/shut-min-weekday.mjs` and `eval/shut-min-weekday.out.txt`.

*Estimates from the numbers you type in, not legal or HR advice. Check your local lone-worker and safety rules.*
