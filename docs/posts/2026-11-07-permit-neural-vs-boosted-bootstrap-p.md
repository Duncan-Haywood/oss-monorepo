---
title: "Does a neural net beat boosted trees at predicting permit timing? 45 paired tests, corrected"
seo_title: "Neural net vs LightGBM for permit duration: 45 bootstrap tests"
date: 2026-11-07
tags: [build-data, research, construction, statistics]
description: "Bootstrap p-values for neural minus boosted quantile loss on Chicago, San Francisco and Austin permits, 2022 to 2024, with Holm and BH correction."
---

In the build-data programme we compare an untuned MLP with LightGBM for predicting how long a building permit takes, in three cities, two targets and three quantile levels, for three test years: 45 cells. Each cell is a paired test on the same permits, resampling test weeks 2,000 times.

Today's rerun on freshly pulled feeds gives 33 cells whose interval excludes zero. Correcting for 45 tests, 22 survive Holm and 31 survive Benjamini-Hochberg. The earlier normal-approximation shortcut said 24 and 29, so it was close but not exact. San Francisco application-to-issue stays the one stable loss for the neural net; the other single-cell results move around by year.

A caution we found along the way: refitting on a fresh data pull moved several cells across zero (2023 went from 6 worse and 5 better to 7 and 6), so single-cell significance here is not stable, only the pattern is. The 45 cells also share data, so the counts are descriptive. Code, p tables and log: `research/build-data/`, MIT licensed.
