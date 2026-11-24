---
title: "Which day each customer gets: re-zoning a weekly route book cut drive time by a third"
seo_title: "Re-zoning a weekly route book cut drive time by a third"
date: 2026-11-24
tags: [route-stop-optimizer, routing, optimization, small-business]
description: "A free weekly route planner chooses each recurring customer's service day. On invented books it cut weekly driving 35-43% against days dealt out as books grow."
---

A pool route, a lawn route or a pest-control route serves the same customers every week. The order of a day's stops matters, but the bigger choice is made once and then forgotten: which day each customer is on. Most books grow one sign-up at a time. The new customer goes on whatever day has room, so next-door neighbours end up on Tuesday and Friday, and the driver crosses town every day.

The [Route Stop Optimizer](https://marisstella.app/route-stop-optimizer/) now has a [weekly planner](https://marisstella.app/route-stop-optimizer/weekly.html) for that choice. Paste each customer with its service minutes, visits a week, any days it must have, and the days it has now. The planner chooses the days and every day's routes for your drivers, keeping each route within the shift. Then it shows what the new week saves against the current one. Both weeks are routed by the same engine, so the difference is only the days.

## What it does

It solves the periodic vehicle routing problem. A twice-weekly customer gets a spread pattern: Monday and Thursday, Monday and Friday, or Tuesday and Friday on a five-day week. Three visits a week means Monday, Wednesday and Friday. The search is ruin and recreate with simulated annealing. It pulls a customer and its nearest neighbours (or a whole route) off every day they are on. Then it puts each one back on the pattern whose days have the cheapest insertions in total.

Moving a customer means a phone call, so each move costs a set number of driving minutes (10 by default). A customer only moves when the saving is bigger than that. Everything runs in the browser, and nothing is uploaded.

## How it was checked

- **Against the true optimum:** on 85 small weeks (six customers, one or two drivers, a tight shift, some twice-weekly customers), it matched the optimum found by trying every pattern, driver split and visit order.
- **Against how books look:** we invented books of 40, 80 and 150 customers, five of each, with a quarter twice a week and an 8-hour shift.

| customers | drivers a day | less driving than days dealt out as books grow | less driving than one pie slice of the map per day | overtime left |
|---|---|---|---|---|
| 40 | 1 | 43% | 26% | none (baselines 1.3 to 1.9 h a week) |
| 80 | 2 | 40% | 21% | none |
| 150 | 3 | 35% | 12% | none (baselines 3.6 to 4.1 h a week) |

Pie slicing is the usual hand method and gets a good part of the way. The planner still finds 12 to 26% more and clears the overtime.

## What it does not know yet

These are invented books, not a real company's. The results have not been compared with a published periodic-routing benchmark either: the hosts that serve the standard files refused this session's connections. Five runs with different random seeds on the same book land within 2 to 4% of each other. Tight shifts are where the search sticks. Travel times are straight-line miles times a road factor, not a road network. Every-other-week customers and keeping a customer with the same driver come next. The method and full table are in [eval/weekly-2026-11-24.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/route-stop-optimizer/eval/weekly-2026-11-24.md).

If you run a recurring route, paste your current days and see what the planner suggests. Check any change with your customers before you make it.
