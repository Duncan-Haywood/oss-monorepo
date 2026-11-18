---
title: "Rolling conformal calibration changed nothing for permit times, and why"
seo_title: "Rolling conformal on building permit lags: why it cannot narrow"
date: 2026-11-04
tags: [research, conformal-prediction, building-permits, negative-result]
description: "We tried rolling and adaptive conformal calibration on Chicago and San Francisco permit review times. Coverage did not move to the fourth decimal."
---

Our permit-timing intervals are meant to cover 80% of 2024 permits but cover
86.7% in Chicago and 90.1% in San Francisco. The previous attempt (grouping by
the chance a permit is same-day) failed, so we tried the obvious next lever: calibrate on
a rolling window of already-known outcomes in 2024, with windows of 60, 120 and
365 days, all known outcomes, and Gibbs and Candès's adaptive conformal.

Result: coverage was identical to the static calibration in every column
(Chicago 0.867, SF 0.901), and so was the interval width (68 and 63 days).

The reason is a point mass. Between 30% and 55% of permits are issued the day
they are filed, and for those the conformal score is exactly 0. While that
mass is above 20%, the 80th-percentile score is 0 whatever the window. In
Chicago the same-day share fell from 52% in 2023 to 30% in 2024, a real shift,
and still the shift in calibration stayed 0 days. The width comes from the
model's own upper quantile, so the next experiment tunes that.

This is one test year and two cities; the log and code are in
`research/build-data/` (session 22). It was written with AI assistance and is
not advice.
