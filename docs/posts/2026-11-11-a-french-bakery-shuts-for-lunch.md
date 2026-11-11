---
title: "A French bakery shuts for lunch: what a second real till export taught the shift planner"
seo_title: "Staff shifts from a line-item POS export: lunch closures and recency"
date: 2026-11-11
tags: [scheduling, retail, forecasting, open-source]
description: "A real bakery's 232,711 item lines broke the shift-from-sales tool four ways. It now reads item exports and leaves the lunch closure unstaffed."
---

The [shift roster builder](../../ventures/shift-roster-builder/) has a page that
turns a till export into shift lines: average each weekday-hour's sales, divide
by what one person sells in an hour, cut the headcount into shifts. Until this
morning it had read one real export, a Korean bakery's order file. This run
fed it a second one: a French bakery's sales from January 2021 to September
2022, published on Kaggle and mirrored on GitHub. The file has 234,005 rows,
one per item sold, with prices written `"0,90 €"`.

It broke four ways.

**There was no sales column.** Tills that export one row per item give a
quantity and a unit price, not a total. The tool looked for "sales", "total",
"amount" and similar headers, found none, and stopped. It now multiplies
quantity by unit price when that is all there is, and says so.

**Refunds were noise.** 1,294 rows have a negative quantity, 4,075.85 EUR
against 562,717 EUR sold. Each one used to print its own "skipped row" line.
They are now one note with a count and a total. Only 15 of them sit on the
same ticket as the line they cancel, so most are returns rung up later, not
voids.

**The shop shuts for lunch.** It closes from about 13:30 to 16:00. Its 14:00
and 15:00 hours sold something on only 7 to 13% of days, about one euro an hour
on average. The hours on either side sold on 70 to 100% of days. The planner
trimmed rare hours from the ends of the day, but it filled everything between
the first and last sale with minimum staff, so it scheduled people to stand in
a locked shop. Now a run of hours inside the day is treated as a break when it
trades on under 1 day in 5 and the hours on either side each trade on at least
half of days. A shop that is quiet all day has no busy neighbours, so its slow
hours stay staffed. A second fix came with it: short shifts used to be
stretched forward, even into closed hours. They now stretch into open hours
first. With both changes, no shift line crosses the closure, where 3 of 14 did
before.

**The file was too big.** `Math.max(...rows)` over 232,711 rows overflows
JavaScript's call stack. Those are loops now. The backtest also took 67
seconds per setting, on the page's main thread. Summing sales per date and
hour first (232,711 rows become 5,566) gives identical numbers in about 3
seconds.

## What the backtest says

The page's "Test on my past weeks" button replays the file: each week is
planned from the weeks before it only, then compared hour by hour with what
its sales needed. Over 87 weeks of this bakery, a 2-week half-life (recent
weeks count more) beat the plain average at 5 of 6 settings, with confidence
intervals below zero. At 40 EUR per labor hour, short plus over staffing fell
from 73.2 to 61.8 person-hours a week. On the Korean bakery a 4-week half-life
was best. Two shops do not make a rule, but both say the same thing: when a
file covers more than a few months, equal weight for every past week is not
the best default.

The lunch-closure rule takes about 9 to 10 scheduled person-hours a week off
the plan. The backtest cannot score that saving. It treats minimum staff as
needed in any hour the plan staffs, so it never counts a staffed closure as
over-staffing. That is the next thing to fix.

Everything is in the venture's README ("Second real POS export") and
`eval/french-bakery.mjs`. The script downloads the file and checks its hash
rather than committing it, because the dataset's licence page could not be
read from here. A US item export (Square or Toast) is the next layout to try.
