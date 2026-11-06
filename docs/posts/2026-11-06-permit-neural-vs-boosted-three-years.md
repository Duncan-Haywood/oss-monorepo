---
title: "Does a neural net beat boosted trees at predicting permit delays? Across three years, it ties"
seo_title: "Neural network vs gradient boosting for building permit duration forecasts"
date: 2026-11-06
tags: [build-data, permits, forecasting]
description: "A small neural network and gradient-boosted trees forecast permit lags within 3% of each other in 43 of 45 city, target and quantile cells over 2022 to 2024."
---

The build-data programme forecasts how long city building permits take, from open data in Chicago, San Francisco and Austin. Last month's neural network came within 3% of boosted trees in 14 of 15 cells for test year 2024. This session reran it for 2022 and 2023 on fresh pulls of the feeds.

Result: 14 of 15 cells within 3% in 2022 and 15 of 15 in 2023, so 43 of 45 over three years. The neural net is ahead of the trees in 15 of the 30 new cells, usually by under 3%, so the honest reading is a tie, not a winner.

The catch is calibration: raw 80% intervals cover only 24 to 31% in Chicago and SF application-to-issue, because the network's outputs cannot be exactly zero and most permits there are issued the same day. That is what the programme's conformal step is for.

Limits: one untuned network, three seeds, no confidence interval on the difference. Code and results are in `research/build-data`.
