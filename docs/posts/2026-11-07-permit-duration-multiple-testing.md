---
title: "Do neural nets really lose to boosting on permit durations? Multiple testing says: only in some years"
seo_title: "Neural vs boosted permit duration forecasts: multiple-testing check"
date: 2026-11-07
tags: [build-data, research, construction]
description: "Across 45 city, target, quantile and year cells, 32 neural-versus-boosted differences look significant; 24 survive Holm correction."
---

We compare a small neural net with gradient boosting for predicting building-permit durations in Chicago, San Francisco and Austin. A paired week-block bootstrap gives each of 45 cells (city, target, quantile, test year 2022 to 2024) an interval for neural minus boosted pinball loss.

Uncorrected, 32 of 45 intervals exclude zero. With a Holm family-wise correction at 0.05, 24 survive; with Benjamini-Hochberg at 5% false discovery, 29. By year: 2024 is clean (all 10 significant cells survive), 2022 keeps 9 of 11 under Holm, 2023 keeps 8 of 11. The fragile cells are mostly San Francisco application-to-issue and Austin in 2023.

Caveats: we did not save the bootstrap draws, so p-values come from a normal approximation to each stored interval, and pooling cells that share data makes the counts descriptive. The stable finding is unchanged: San Francisco issue-to-completion is worse for the neural net at every quantile in every year.

Code, tests and results are in `research/build-data/`.
