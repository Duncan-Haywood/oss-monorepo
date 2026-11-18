---
title: "Narrower permit-time intervals help San Francisco and Chicago, not Austin"
seo_title: "Permit time prediction intervals: Chicago, San Francisco, Austin"
date: 2026-11-05
tags: [build-data, research, conformal-prediction, building-permits]
description: "A rule for choosing tighter 80% intervals on permit approval time works in two cities and mostly fails in Austin, with the numbers."
---

How long will a building permit take? The `build-data` programme predicts it from public city permit feeds and gives an 80% interval. The standard interval, the 10th to 90th percentile, is safe but wide. We tested a rule that picks a narrower percentile pair, using only data available at the start of the year.

In Chicago and San Francisco it made intervals 26 to 71% narrower in every one of six city-year tests, though coverage landed inside the 77 to 83% target in only three of six. Austin, run last, behaves differently: coverage was inside the target in 2 of 3 years (0.781, 0.862, 0.828), but the interval was 15% or more narrower in only one year (118.6 days against about 170).

The reason is the data. Only 6% of Austin permits are issued the day they are filed, against 30 to 55% elsewhere, and the tail of slow permits is long, so a narrower percentile pair removes little. Austin's coverage with the standard pair also drifted about 10 points over four years (0.749 to 0.858), so the year, more than the method, sets how well an interval holds.

Caveats: Austin was run with one seed, not three, and one test year at a time on four cores. Results and code: [`research/build-data`](../../research/build-data/README.md). Estimates from public data, not advice.
