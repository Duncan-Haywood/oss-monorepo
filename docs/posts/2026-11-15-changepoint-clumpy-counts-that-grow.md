---
title: "Clumpy counts that grow: one wrong mean hid three in four steep bends"
seo_title: "Overdispersed growing counts: fixing a negative-binomial size estimate"
date: 2026-11-15
tags: [changepoint-detection, statistics, pre-registration, count-data, negative-binomial]
description: "The changepoint detector read clumping against the global mean, so fast-growing counts looked Poisson. Reading it locally finds 56% of steep bends, not 16%."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has a setting for clumpy counts, `--overdispersion nb`. Real counts are rarely Poisson. Sales, visits and complaints come in bursts, so their spread is wider than their mean, and a plain Poisson cost reads every burst as a change. The negative binomial allows for that extra spread through one number, the size r: the smaller r is, the clumpier the counts.

For a month the project's notes carried an open item: on counts whose growth rate jumps sharply, the uncertainty range around the bend held the true point only about 80% of the time, not the promised 95%. Worse, the bend was found within 20 points on only 14% of those series. The notes put that down to a hard cell and left the tuning alone.

It was a bug. The size was estimated by comparing the typical squared jump between neighbouring counts with the **global** mean of the series. On a series that climbs from 7 a day to 700, the typical jump belongs to a typical day, far below the global mean squared. So r came out too large, and on the steepest series it came out infinite. Infinite r means "not clumpy". The setting then quietly fell back to the plain Poisson cost, dozens of false steps soaked up the growth, and the bend got pushed to the edge of the search.

## The fix, tested twice

Each jump is now read against the level of the 7 counts around it. The size solves one equation: the average of those scaled jumps, each capped so a single real step can't dominate, has to match what clumpy counts of that size would give. I wrote five pass/fail bars before running anything, including one that plain Poisson counts must still read as Poisson.

The first version used a median and failed that bar. At small counts the squared jumps take only a few whole-number values, so the median lurches, and 32 of 100 Poisson series read as clumpy. The capped mean has no such steps. Tuned on those seeds and then run once on fresh ones, it passed all five bars:

| 200 clumpy counts (true size 7.7) | before | now |
|---|---|---|
| estimated size, steepest growth | infinite | 8.6 |
| plain Poisson counts read as Poisson | 95 of 100 | 99 of 100 |
| steep bend found within 20 points | 81 of 500 | **280 of 500** |
| range holds the true bend | 72% | **99%** |
| false bends on straight growth | 11 of 100 | 0 of 100 |

## What it changes on real data

The old size was too large wherever a level moved, so on real series the fix means fewer changes. Bike-share days, Wikipedia pageviews and UK lung deaths all get fewer cuts. None of the documented events was lost: the 1989 Ansett pilots' dispute is still dated, start and restart, on the airline's routes, and the 1983 UK seat-belt law still shows. One earlier observation reversed, and the notes now say so. On two years of bike-share days with a yearly season, the holiday list used to remove changes and now adds a few.

Still open: a real count series with a documented sharp change in its growth rate, to check the 99% outside simulation.
