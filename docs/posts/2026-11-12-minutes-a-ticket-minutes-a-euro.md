---
title: "Minutes a ticket, minutes a euro: a labour standard from a till export"
date: 2026-11-12
tags: [shift-roster-builder, scheduling, forecasting, small-business]
description: The roster builder now plans shifts from minutes a ticket, a euro and an item. On a real bakery, ticket-heavy plans were steadier week to week.
---

Should a shop plan staff from how much money it takes, or from how many customers come in? Until today the [shift roster builder](https://marisstella.app/shift-roster-builder/shifts-from-sales.html) made you pick one. "Sales per labor hour" plans from money. "Staff to: customers" counts tickets. A bakery's morning baguette rush is many small tickets and its lunch hour fewer, bigger ones, so the two put the hours in different places.

Paid workforce tools don't make you choose. They use a *labour standard*: the minutes each unit of work takes, added up. A ticket might take 1.5 minutes at the till, each item 0.3 minutes to pick and bag, and each euro a little packing time. The roster builder now does the same. Choose "Staff to: minutes of work" and type something like `1.5/ticket + 0.3/item`. On the command line it is `--standard "1.5/ticket + 0.3/item"`. Each row of the export becomes its minutes of work. The rate box then means minutes of work per labor hour: 60 is someone busy every minute, and 45 leaves a quarter of each hour for cleaning and restocking. The rest works on the minutes unchanged: the recent-weeks weighting, the short-versus-spare cost, the shift cut and the backtest on your own past weeks.

We ran it on a real French bakery's till export: 136,451 tickets over 87 tested weeks. We held the total work fixed and slid the share of it that comes from tickets from 0 to 1.

- **The ends are the old plans, exactly.** At 0 the shifts match the money plan line for line (179 hours a week). At 1 they match the ticket plan (208 hours).
- **The afternoon grows as tickets count more.** Hours from 14:00 went 24, 24, 28, 32, 44. The early morning stayed at 60 to 62.
- **Tickets were the steadier driver.** We planned each week from the weeks before it and scored it against that week's own need. Short plus spare hours fell from 49% to 40% of the hours scheduled as the ticket share went from 0 to 1. A driver that moves less from week to week needs less padding.
- **Items added little.** Moving half or all of the work onto items changed the off share by about a point.

What this does not tell you is the right minutes. That takes a stopwatch at the counter, and no export holds it. It is one shop, and scoring a plan against its own driver measures how predictable the driver is, not whether it is right. If you can't time your staff and can't decide between money and customers, steadiness is a fair tie-breaker.

The method, the numbers and how to rerun them are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/README.md) and `eval/labour-standard.mjs`. The tool is free, nothing is uploaded, and it is not professional advice.
