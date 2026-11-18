---
title: "The drive is on the clock: what a two-shop roster costs when the trip is paid"
seo_title: "Paying travel time between work sites in a staff schedule"
date: 2026-11-14
tags: [shift-roster-builder, product, measurement]
description: "A two-shop roster that ignored paid travel sent people across town 6 to 8 times a week, about 2.5% of payroll it never showed. Pricing it fixed that."
---

Earlier today [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) learned [to keep a person's shifts at two shops far enough apart to make the trip](2026-11-14-shift-roster-thirty-minutes-across-town.md). That rule makes sure the trip is possible. It did nothing about who pays for it.

In the US, travel from one job site to another during the workday counts as hours worked (29 CFR 785.38). If someone works lunch at one shop and dinner at the other, the 45-minute drive between them is paid at their wage, and it counts toward overtime. The builder used to price that day as if the drive were free. So when two people could cover the two shops equally well, it had no reason to keep each of them in one place.

## What changed

`--pay-travel` (on the page, "Pay travel between sites") adds the trip minutes to that day's paid hours, so they count toward daily and weekly overtime like any other hour. `--travel-allowance 4.50` adds a flat amount per trip, for mileage or a fare, and keeps it outside overtime and the payroll burden. Both are priced inside the search, the exact check and the call-out cover finder. The report gets one new line: how many trips, who makes them, and what they add to payroll.

## What it was costing

I reused the made-up restaurant pair from the earlier post: two shops with split shifts, a 45-minute trip and everyone allowed at both. Over the same 12 seeded weeks, I built each roster the old way and then costed it with its trips paid. To keep the comparison fair, I pinned every shift to the same person and rebuilt, so the same code prices both rosters. Then I built each week again with the trip priced.

| team | roster | trips (12 weeks) | paid travel | true payroll |
|---|---|---|---|---|
| 8 people | trip not priced | 75 | 56 h | $45,071 |
| 8 people | trip priced | 4 | 3 h | $44,088 |
| 7 people | trip not priced | 101 | 76 h | $45,294 |
| 7 people | trip priced | 7 | 5 h | $44,028 |

The old roster's own total was $44,034 for eight people and $43,887 for seven. Paying the trips added $983 and $1,266 on top, about 2.2% and 2.8% of payroll. With the trip priced, the search found someone already at the right shop for almost every one of those shifts. Every one of the 24 weeks came out cheaper, and none left an hour more uncovered. The priced rosters landed within $54 and $141 of the old roster's unpaid figure. So the travel bill was nearly all avoidable. It wasn't the price of covering the shifts.

## What this does not show

The shops, wages and trip times are invented, and no real multi-site payroll has been read. The rule pays every same-day hop, including one across a long split-shift break when someone might have gone home in between. Whether that time is owed depends on the facts and the place, and the tool is a planning aid, not legal advice. Travel counts toward pay and overtime but not toward a person's hour limits. Per-site wages, such as a dearer airport shop, are next.

The script is `eval/paid-travel.mjs` in the [venture's folder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder), and the README section "Paying the trip between sites" has every number.
