---
title: "A yearly term on two years of bike rentals makes change detection worse"
seo_title: "Why a period-365 seasonal term over-cuts two years of daily data"
date: 2026-11-05
tags: [changepoint-detector, time-series, negative-result]
description: "Adding a 365-day seasonal term to two years of Capital Bikeshare counts took the change count from 56 to 134. What that says about seasonal terms and short series."
---

The changepoint detector's holiday list had not helped on real bike-share data, and the README said the next thing to try was a yearly term. We tried it on 731 days of Capital Bikeshare rentals, with and without the dataset's 21 holidays.

With a weekly term the registered-rider series gives 56 changes. With a 365-day term it gives 134. Casual riders go from 70 to 129. Two years give each day of the year two observations, so the seasonal factors follow noise and the change search cuts around them.

The holiday list now does remove changes (134 to 125, 129 to 120). The reason is not that it models holidays well. A factor fitted on two points per day absorbs part of a holiday by itself, and the casual holiday factor drops to 1.03 against a raw ratio of 1.41.

The lesson for short series is plain: a seasonal term needs several cycles. The result, script and test are in `ventures/changepoint-detector` (`eval/holiday-bikes-yearly.mjs`). This is one dataset and one run, so it shows a cost, not a rule.
