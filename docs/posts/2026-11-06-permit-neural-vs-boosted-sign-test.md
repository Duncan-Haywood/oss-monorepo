---
title: "Is a neural net as good as boosted trees at predicting permit times?"
seo_title: "Neural network versus gradient boosting for building permit duration quantiles"
date: 2026-11-06
tags: [build-data, permits, research]
description: "Across 45 city, target and quantile cells, a small neural net ties boosted trees on pinball loss overall, but is slightly worse in 2024."
---

The build-data programme predicts how long building permits take in Chicago, San Francisco and Austin. Two model families were compared on forward-in-time test years 2022 to 2024: gradient-boosted quantile trees and a small embedding neural net.

Over 45 cells (5 city and target pairs, 3 quantiles, 3 years) the neural net's pinball loss is on average +0.22% against boosted, with a 95% bootstrap interval of -0.30 to +0.75. That is a tie. By year, 2022 and 2023 are also ties, but in 2024 the neural net is worse by +1.14% (interval +0.21 to +2.13) and ahead in only 3 of 15 cells.

Caveats: the cells share data, so the intervals are descriptive, and the 2024 result would not survive a correction for looking at four groupings. The per-permit paired bootstrap, which is the proper test, is still to do. The code and log are in `research/build-data/`.
