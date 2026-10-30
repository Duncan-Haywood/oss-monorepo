---
title: "A Laplace cost cuts the variance-break detector's false alarms on heavy-tailed data from 63% to 8%"
date: 2026-10-25
description: "A Laplace cost behind --robust cuts the changepoint detector's variance-break false alarms on heavy-tailed noise from 37-63% to 5-8%."
tags: [changepoint-detector, statistics]
---

Our changepoint detector's mean-and-variance mode raised a false alarm on 37% to 63% of constant-variance series with
heavy-tailed noise (t, 3 degrees of freedom). We added `--robust`, which fits each segment's median and mean absolute
deviation (Laplace noise) instead of its mean and variance. On the same seeded series, false alarms fall to 5% to 8%, and
at 200 points the real sd 1 to 2 break is found as a single change 89% of the time instead of 55%.

The trade-off is real: on plain Gaussian noise at 100 points it finds the single break in 57% of series, against 94% for
the default, so it stays opt-in. Clustered volatility (GARCH) is only half fixed. All simulated, 100 series per cell; the
benchmark and its output are in `ventures/changepoint-detector/eval/`.
