---
title: "Telling a ramp from noise that sticks: what --ar1 keeps and loses"
date: 2026-11-08
tags: [changepoint-detector, statistics, time-series, open-source]
description: "A synthetic test of ramp detection in autocorrelated noise: the plain changepoint run makes 12 to 15 cuts per series, --ar1 makes 2, and keeps ramps of 24 points or more but loses short ones."
---

Real series are rarely independent from one point to the next. When the noise sticks (lag-1 correlation 0.5), a changepoint search that assumes independence cuts it into steps. We ran the changepoint-detector's ramp grouping on 300-point series with AR(1) noise and a known ramp of height 8, 40 seeds per cell.

With no change at all, the plain run makes 11.7 cuts per series. With `--ar1` it makes 0.1. With a real ramp the plain run makes 13 to 15 cuts, so the reported "ramp" is one group among many; `--ar1` makes 1.5 to 2.7 cuts and reports the ramp in 35 of 40 series for a 24-point ramp and 37 of 40 for a 48-point one, always on the true span.

The cost is a short ramp: over 12 points it is found only 13 of 40 times, since the wider noise scale reads it as a single step or nothing. This is one noise model and one height, synthetic, not a calibration on real data. The script, output and tests are in `ventures/changepoint-detector` (`eval/ramp-ar1.mjs`).
