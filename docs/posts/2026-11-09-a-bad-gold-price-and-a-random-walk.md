---
title: "A bad gold price and a random walk: what a changepoint detector says"
date: 2026-11-09
tags: [research, changepoint, time-series]
description: "Daily gold prices run through our changepoint detector: 113 level changes on raw prices, 7 on returns, and a known data error that shows up as a pair of cuts."
---

Daily gold from 1985 to 1989 has no level shift to find, and one data error: day 770 reads 593.7 where its neighbours read about 485. Run on the raw prices, our changepoint detector (`ventures/changepoint-detector`) returns 113 level changes, a staircase on a random walk. On daily log returns it is better behaved: 7 cuts, three of them (769, 771, 773) around the bad day. Switching to the volatility model and changing how the penalty is set moves the count from 10 to 5 to 2.

Two lessons: difference a random walk before looking for steps, and a one-day outlier comes out as a pair of changes, not a flag. A spike flag for continuous series is an open item. All numbers are pinned in `gold-price.test.mjs`; one series, no rate claimed.
