---
title: "When the autocorrelation fix erases a real step: Canada's baby boom"
seo_title: "Changepoints in Canadian fertility 1931-1968: --ar1 finds none"
date: 2026-11-09
tags: [changepoint-detector, time-series, real-data]
description: "On Canada's fertility rate, every changepoint model that may cut dates the 1946 baby boom, but the autocorrelation correction finds no change at all."
---

The changepoint detector over-cuts smooth series, and its `--ar1` option exists
to fix that by widening the noise scale for autocorrelation. I tried it on a
series with one well-known step: Canada's total fertility rate, 1931 to 1968,
38 yearly values, where the baby boom starts in 1946.

The plain model cuts seven times, 1946 among them (3018 to 3488). The series
has rho about 0.95, so the other six are mostly drifting levels read as a
staircase. `--model meanvar` gives the shortest answer: 1946 (8.8 noise
standard deviations) and 1959, where volatility rises as the fall begins.

`--ar1` and `--ar1 joint` find nothing, 1946 included. At rho 0.95 and 38
points the correction is so wide that a real 356-birth jump disappears. That is
a second real series, after the Peace Bridge, where the fix removes a true
change. It is one series, so no rate is claimed. The three tests and the data
source are in `ventures/changepoint-detector/` (`canada-fertility.test.mjs`).
