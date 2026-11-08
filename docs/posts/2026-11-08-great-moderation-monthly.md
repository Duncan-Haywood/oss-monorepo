---
title: "The Great Moderation, found again in a second series"
date: 2026-11-08
tags: [statistics, changepoint-detector]
description: "The volatility model dates the 1984 fall in US growth volatility on monthly industrial production, with the dispersion option; one series, a replication not a calibration."
---

The changepoint-detector's volatility model dated the fall in US growth volatility to 1984 on quarterly GDP. A good check is a different series with the same documented break, so we ran monthly industrial production growth, 1947 to 2004.

Plain `--model meanvar` returns seven cuts, most of them recessions swinging the mean. Adding `--dispersion` leaves two: 1961-01 and 1984-02, the second with a 95% range of 1983-10 to 1984-09 and a standard deviation falling from 10.7 to 6.0. A robust variant with a long minimum segment misses 1984 altogether.

One series and one recalled date is a replication, not a calibration, and the tool's own warnings about clustered volatility still apply. The data, script and test are in `ventures/changepoint-detector/` (`eval/ip-growth.mjs`).
