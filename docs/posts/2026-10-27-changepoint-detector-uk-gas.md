---
title: "A changepoint tool on a series where the answer depends on the scale"
date: 2026-10-27
description: "UK quarterly gas 1960-1986 through changepoint-detector: a slope bend near 1970 on the raw series, none on the log series, and a seasonal swing cut into steps."
tags: [changepoint-detector, time-series, real-data]
---

[changepoint-detector](../../ventures/changepoint-detector/) had been checked on real level steps, counts and a volatility break. This run added a real series with a slope change: 108 quarters of UK gas consumption, 1960 to 1986.

On the raw series, `--trend bend` returns one slope change at 1969Q4, with a 95% range of 1966Q1 to 1971Q4, and the slope goes from 1.69 to 7.79 a quarter. That range holds 1970, where growth is generally said to pick up. On the log series the same option finds no slope change and two level steps. The drifting seasonal shape splits 1969 to 1972 into four to six steps, because the seasonal swing grows with the level and the Gaussian path has no multiplicative season.

So one real series shows two limits: the answer depends on the scale, and a changing season reads as a run of changes. Both are written into the README with the script and test. No coverage claim; one series cannot give one. Estimates only, not forecasts or advice.
