---
title: "Why a changepoint detector over-cuts a smooth curve, and a floor that helps"
date: 2026-11-04
description: "Australia's population grew steadily for 22 years and the detector found ten changes. A noise floor tied to the series' own step size cuts that to three."
tags: [changepoint-detector, time-series, statistics]
---

# Why a changepoint detector over-cuts a smooth curve

Australian residents, quarterly, 1971 to 1993, in logs: a near-deterministic
growth curve. Nothing documented broke, yet the trend model reported ten
changes. The detector estimates noise from the scatter of neighbour
differences. On a smooth curve that scatter is tiny while the drift per step is
not, so every bend looks huge.

`--noise-floor k` sets sigma to at least `k` times the median absolute step.
On white noise that median is about 0.95 sigma, so `k` under 1 never binds.
On the population series the trend model goes 10, 4, 3, 1 changes at k = 0, 0.5,
1, 2. On 200 synthetic series with one real step, the step is still found 160
times with or without the floor, but the floor altered the answer on 15.

It is off by default: no `k` is calibrated yet, and that needs a real drifting
series with a documented break. The level-only model still reports a staircase
on growth, as it should. Numbers and code: `ventures/changepoint-detector`
(`eval/noise-floor.mjs`).
