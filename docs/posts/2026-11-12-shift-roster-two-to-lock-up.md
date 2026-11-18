---
title: "Who locks up? Cleaning after close, and what a two-person rule costs"
seo_title: "Closing shift staffing: after-close cleaning and lone-worker rules"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "90 minutes of cleaning after close is one person staying two hours. A two-to-lock-up rule cost a bakery 28 hours a week where one closes, 0-7 where two are on."
---

[Shifts from your sales](https://marisstella.app/shift-roster-builder/shifts-from-sales.html) turns a till export into the shifts a shop needs. Earlier today it learned that some work happens with the doors shut: `45/after-close` in the labour standard means 45 minutes of cleaning after the last sale, so the closer stays on.

It handled one case badly. Ninety minutes after close went into the one hour after closing, and 90 minutes in one hour is two people. That is rarely what a shop does. The closer stays on for an hour and a half.

## What changed

- **Shut-door work runs at 60 minutes a person and spills into the next hour.** Nobody is waiting at the till, so the person works every minute, whatever rate the open hours are planned at. Ninety minutes after a 13:00 close is now one person at 13:00 and 14:00. Before-open work spills earlier the same way.
- **"Staff with the doors shut" (`--shut-min` on the command line)** is the fewest people on in those hours. The default is 1. Put 2 if nobody may open or lock up alone. Two people then share the work, so the 90 minutes becomes two people for one hour.
- **The two-person rule can't be priced away.** The planner weighs whether a short stretch of extra staff is worth a 4-hour shift. On the first run of the measurement it was quietly dropping the second closer on most days, because on paper they had little to do. That's fine for a quiet hour. It's wrong for a safety rule, so runs at or under the shut-door minimum are now never dropped.

## What it costs on a real bakery

Here's a French bakery's till file (600 trading days), at 6 minutes of work a ticket, with shifts of 4 to 8 hours. These are scheduled hours a week:

| Cleaning after close | One on minimum, one locks up | One on minimum, two lock up | Two on minimum, one locks up | Two on minimum, two lock up |
|---|---|---|---|---|
| none | 184 | - | 218 | - |
| 45 min | 191 | 219 | 225 | 232 |
| 90 min | 202 (212 before) | 215 | 232 | 232 |
| 150 min | 213 | 229 | 239 | 246 |

Three things stand out:

1. **Spreading the work saves 10 hours a week** when 90 minutes of cleaning used to call in a second person, who then had to work a 4-hour minimum shift.
2. **A two-to-lock-up rule is expensive where one person normally closes.** After 45 minutes of cleaning it adds 28 hours a week. The second person can't be booked for one hour, so they come in for four. With more cleaning to share, the cost falls to 13-16 hours.
3. **Where two are on anyway, the rule is close to free:** 0 to 7 hours a week.

So "should two people close?" turns on how many are already there at closing time. The plan shows the price either way.

## What we can't tell you

Whether a two-person rule applies to your shop depends on local law, your insurer and your own risk assessment. A sales file can't say. Our backtest can't say either: each plan is scored against its own rule, so the two-closer plan looks "less short" only because it counts the second person as needed. The minutes here were swept, not measured, and this is one shop.

The code, tests and full output are in the [repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) (`eval/shut-crew.mjs`). The tool is free, runs in your browser and needs no sign-up. Its numbers are estimates from your own file, not legal or staffing advice.
