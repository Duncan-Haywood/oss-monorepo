---
title: "A bad data point is not two regime changes: a spike flag for changepoint-detector"
seo_title: "Changepoint detection outliers: spike flag for mean shifts"
date: 2026-11-09
tags: [changepoint-detector, time-series, outliers]
description: "A mean-shift changepoint model reads one bad point as a pair of steps. The detector now labels such short excursions as outliers, tested on daily gold prices."
---

A mean-shift changepoint model has a blind spot: one wrong value in an otherwise
flat run is cut out as a short segment, so it shows up as two "regime changes"
either side of it. Daily gold prices 1985 to 1989 have a known bad point
(about 594 against roughly 485 either side), and the detector reported cuts
around it like any other change.

`changepoint-detector` now adds a `spikes` list and a `spikeWarning`. The rule:
a segment of at most 3 points, between two segments of 5 or more whose levels
agree to within a third of the excursion, and more than 4 noise standard
deviations off them. On the gold prices it names the bad point at 30 noise
standard deviations.

What is not claimed: on the daily returns the bad day is a +20% / -20% pair that
nets to about zero, so it is not flagged there (two other short runs are, at 7.1
and 4.9 sds). The thresholds are untuned and no false-flag rate has been
measured; the test uses one real series and one seeded synthetic pair.
