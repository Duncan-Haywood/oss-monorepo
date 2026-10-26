---
title: "Fewer false alarms on volatile data: a bootstrap penalty for changepoint-detector"
date: 2026-10-27
description: "changepoint-detector's --bootstrap sets the meanvar penalty from block-resampled residuals, cutting false alarms on GARCH-style noise from 51% to 16%."
tags: [changepoint-detector, statistics, changepoint, simulation]
---

[changepoint-detector](../../ventures/changepoint-detector/) kept reporting breaks in series that had none whenever the noise had heavy tails or clustered volatility. A scale factor on the penalty (`--dispersion`) helped halfway. The new `--bootstrap` flag (with `--model meanvar`) instead resamples the fitted residuals in blocks, which keeps the clustering, and sets the penalty to the 95th percentile of the biggest spurious cost drop those resamples produce.

On 200 simulated null series of 200 points, false alarms fall from 51% to 16% on GARCH noise, 62% to 15% on t3 and 54% to 7% on AR(1), and detection of a real sd 1 to 2 break rises. The cost is at 100 points: Gaussian detection drops from 92% to 80%. Simulated data only, same generators used to tune it; no real series has been tried yet. Numbers and script: the README section `--bootstrap`.
