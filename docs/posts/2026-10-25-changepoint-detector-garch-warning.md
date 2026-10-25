---
title: "A changepoint warning that notices clustered volatility"
date: 2026-10-25
description: "changepoint-detector's variance-model warning caught 16-20% of GARCH series; a Ljung-Box line over lags 1-5 of the squares raises that to 34-49%."
tags: [changepoint-detector, statistics, robustness]
---

Variance-change detectors assume independent Gaussian noise. Feed one GARCH noise, where calm and wild stretches
come in clusters with no real break, and it reports a change about half the time anyway. The changepoint-detector's
`meanvar` model already warned when that was likely, but the warning caught only 16% to 20% of GARCH series.

The reason is small: it checked lag 1 of the squared residuals, and for this kind of noise the autocorrelation
sits at lags 2 to 5. Adding a Ljung-Box test over lags 1 to 5 raises the catch rate to 34% (100 points) and 49%
(200 points), at the price of 3 to 5 extra points of false warnings on clean Gaussian series. The numbers come from
a seeded simulation and are reproducible with `node eval/meanvar-robustness.mjs`; no real series has been tried yet.
