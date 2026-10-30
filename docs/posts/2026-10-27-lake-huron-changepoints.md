---
title: "Lake Huron's 1920s drop: three ways to detect it, one of them right"
date: 2026-10-27
description: "A strongly autocorrelated lake-level series through the changepoint detector: the plain model finds ten changes, AR(1) none, mean-and-variance the drop."
tags: [changepoint-detector, time-series, measurement]
---

[changepoint-detector](../../ventures/changepoint-detector/) had been tested on level steps (the Nile), volatility breaks, counts and seasonal series, but never on a series where each year is strongly tied to the one before. Lake Huron's annual level, 1875 to 1972, is that: lag-1 autocorrelation of about 0.8, and a drop near 1920 in the literature.

| mode | changes found |
|---|---|
| plain mean | 10 (1889, 1923, 1929, 1931, 1942, 1951, 1956, 1963, 1966, 1969) |
| `--ar1` (plain or joint) | none |
| `meanvar` | 1889 and 1923 (range 1919 to 1925) |

The plain model reads persistence as a string of small steps; the AR(1) model widens the noise so far that it also hides the drop. Only `meanvar` lands near 1920, and with one series that may be luck. The result is pinned in a test so a later fix has to show it moves these numbers. The open item is an AR(1) mean model that keeps a drop of this size.

The series is R's `LakeHuron` (98 numbers, source noted in the venture's `data/SOURCE.md`).
