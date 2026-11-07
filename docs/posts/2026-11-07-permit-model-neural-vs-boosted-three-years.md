---
title: "Does a neural net beat boosted trees at predicting permit delays? Three years, per permit"
seo_title: "Neural vs gradient boosting on building permit duration: paired test, 2022 to 2024"
date: 2026-11-07
tags: [build-data, research, construction]
description: "A paired bootstrap on 4 million public permits in three cities: the neural-versus-boosted difference is mostly year-specific, with one stable loss."
---

For open building-permit records from Chicago, San Francisco and Austin, we compared a small neural net with LightGBM quantile models on pinball loss, per permit, resampling test weeks. Fifteen city/target/quantile cells per test year, three seeds each.

The neural net is significantly worse in 6, 6 and 8 cells (2022, 2023, 2024) and significantly better in 5, 5 and 2. Only one cell group is stable: San Francisco issue-to-completion is worse for the neural net at every quantile in all three years (9 of 9). Most other differences change sign between years, so a single-year comparison would have told the wrong story.

I predicted the 2022 pattern before running it and half of it failed: more cells were significantly worse than I allowed, and Chicago's 90th percentile, better for neural in 2023 and 2024, was not significant in 2022. None of this is multiplicity-corrected outside 2024. Results, code and the paper section are in `research/build-data/`.
