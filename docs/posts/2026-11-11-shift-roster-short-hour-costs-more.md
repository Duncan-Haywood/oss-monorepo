---
title: "Staff for the average hour and you are short half the time"
seo_title: "How many staff per hour? The newsvendor rule on two real bakeries' sales"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "A free shift planner now staffs each hour for a chosen share of past days, not the average. On two real bakeries it cut the weighted cost of being short or overstaffed."
---

The [shifts-from-sales page](../../ventures/shift-roster-builder/shifts-from-sales.html)
of the free shift roster builder turns a till export into shifts. Until today
it staffed each hour for the *average* sales of that weekday and hour. That
sounds reasonable, but an average sits in the middle, so an hour planned from
it is short on roughly half of its days.

Most managers also don't think a short hour and a spare hour cost the same.
A short hour means a queue, a lost sale or a worn-out team. A spare hour is
one person's pay for standing around. So the page has a new box, "a short
hour costs this many times a spare one", and the command line has a matching
flag, `--short-cost`.

## The rule

Say a short person-hour costs r spare ones. Look at the past days for, say,
Saturday 11:00, and work out how many people each one needed. The headcount
that minimises r × short + over across those days is the smallest one that
covered r / (1 + r) of them. This is the newsvendor rule from inventory
theory, applied to people:

- r = 1: staff for the median day;
- r = 3: staff for three days in four;
- r = 0.5: staff for one day in three.

Recent weeks can still count more (the half-life box), and minimum staff,
lunch closures and closed days work as before.

## Does it help on real sales?

We tried it on two real exports: a Korean bakery's 2,420 orders and a French
bakery's 232,711 item lines. In this backtest every week is planned only
from the weeks before it, then scored on its real sales as r × short + over.
The figures below are person-hours a week (`eval/short-cost.out.txt` in the
venture).

| Shop, r = 3 | Plan from the average | Plan from the 75% day | Difference (95% CI) |
|---|---|---|---|
| Korean bakery, 30,000 won per labor hour | 54.1 | 47.4 | −6.7 (−9.9 to −3.5) |
| French bakery, 40 € per labor hour | 164.7 | 147.3 | −17.4 (−26.9 to −7.9) |
| French bakery, plus a 2-week half-life | 164.7 | 121.4 | −43.3 (−66.7 to −20.0) |

At the Korean shop, the rule beat the average at every weight we tried
(1/3 to 5) at two of the three pay rates. At the French shop, it tied the
average at r = 1 (both plans aim at the middle day). Everywhere else it won, by much more once it was paired with a
half-life, because that shop's trade drifts with the seasons.

As a check on the rule itself, we also ran fixed shares from 10% to 90% and
asked which would have been cheapest in hindsight. For each r, on both
files, the best share was within one grid step of r / (1 + r).

## What it doesn't decide

You still have to pick r: how much a lost sale is worth to you against an
hour's pay. The "test on my past weeks" button shows what each choice would
have cost on your own file. Two bakeries are not every shop, and the
backtest scores headcounts per hour, before they are cut into shifts.

The page works in the browser, and what you paste is never uploaded. It is a
planning aid, not legal or financial advice.
