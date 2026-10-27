---
title: "A bootstrap penalty for the mean model cuts false alarms on autocorrelated noise"
date: 2026-10-26
description: "changepoint-detector --bootstrap now covers the mean model: on AR(1) noise at 0.3, false alarms fall from 80% to 13%; a 2 sd step is still found 98% of runs."
tags: [changepoint-detector, statistics, changepoint]
---

[changepoint-detector](../../ventures/changepoint-detector/) already had a block-bootstrap penalty for the variance model. The mean model, the one most people use, had none, and it assumes independent noise: with mildly autocorrelated data it reports changes that are not there.

`--model mean --bootstrap` now fits once with a loose penalty, keeps the residuals about the segment means, resamples them in blocks (which keeps short memory) and sets the penalty to the 95th percentile of the best single-split gain. On synthetic unit-variance AR(1) noise, n = 200, 100 series per cell:

| noise | false alarms plain | with `--bootstrap` | step found, plain / bootstrap |
|---|---|---|---|
| iid | 5% | 1% | 100% / 100% |
| AR(1) 0.3 | 80% | 13% | 98% / 98% |
| AR(1) 0.5 | 100% | 53% | 98% / 94% |

Caveat: synthetic noise only. A real autocorrelated series is the next thing wanted. The script is `eval/mean-block-bootstrap.mjs`. Estimates, not advice.
