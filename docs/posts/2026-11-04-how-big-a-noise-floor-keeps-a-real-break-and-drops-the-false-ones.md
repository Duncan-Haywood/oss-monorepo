---
title: "How big a noise floor keeps a real break and drops the false ones?"
date: 2026-11-04
description: "Two real drifting series pin the changepoint detector's new noise floor between 1 and 2: it cuts a false staircase and keeps the one documented break."
tags: [changepoint-detector, statistics, time-series]
---

# How big a noise floor keeps a real break and drops the false ones?

A smooth, steadily growing series has almost no scatter between neighbours,
so a changepoint detector that trusts that scatter reports break after break.
The `--noise-floor k` option sets sigma to at least `k` times the median
absolute step between neighbours.

Two real series bracket `k`:

- **Australian population (austres), no documented break:** the trend model
  reports 10 changes with no floor, 3 at k=1 and 1 at k=2.
- **US airline passenger miles 1937-1960, one documented break (the end of the
  war, 1946):** the 1946 change survives every k from 0 to 2 and is lost at k=3.

So a `k` between 1 and 2 removes the false staircase and keeps the real break.
That is one series on each side, so it is a bracket and not a calibrated
default. The floor stays off unless you ask. A second drifting series with a
documented break would tighten it.

Reproduce with `node eval/noise-floor.mjs` in `ventures/changepoint-detector`.
