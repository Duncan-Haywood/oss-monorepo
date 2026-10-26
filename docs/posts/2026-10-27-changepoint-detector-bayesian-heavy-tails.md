---
title: "Heavy-tailed noise fooled the Bayesian changepoint view too: clipping fixed it"
date: 2026-10-27
description: "On t3 noise with no change, changepoint-detector's probability view flagged a change in 47% of 200-point series. Clipping at 2 robust sds cut that to 1%."
tags: [changepoint-detector, statistics, robustness]
---

[changepoint-detector](../../ventures/changepoint-detector/) runs two methods: PELT for the best segmentation and a Bayesian online method for the probability of a change at each point. Last time `--robust` fixed PELT's false alarms on heavy-tailed noise, but the Bayesian view still used Gaussian assumptions.

We measured it first. On seeded series of Student-t (3 df) noise with no change, the Bayesian view reported one at probability above 0.5 in 18% of series at n = 100 and 47% at n = 200. A Laplace likelihood would break the exact Normal-Inverse-Gamma update, so instead `--robust` now clips the series at its median plus or minus 2 robust sds before the Bayesian pass.

Result (100 series per cell): t3 false alarms fall to 1%, and a 1.5 sd mean shift is found more often (48% to 62% at n = 200). Gaussian false alarms stay at 1 to 2%. The cost is that the Bayesian view now almost never reports a pure variance change (3 to 8% before, about 1% after); PELT remains the volatility detector. The clip width was only compared on t3, and everything here is simulated noise. Numbers and script: `eval/meanvar-bayes-tails.mjs` and the README.
