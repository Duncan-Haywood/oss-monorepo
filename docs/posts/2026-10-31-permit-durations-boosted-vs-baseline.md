---
title: "Do boosted models predict permit wait times better than a city's own averages?"
seo_title: "Predicting building permit duration: LightGBM vs per-type quantiles (Chicago, San Francisco, Austin)"
date: 2026-10-31
tags: [research, construction, permits, build-data]
description: "On 2024 permits from three US cities, LightGBM quantile models beat per-type empirical quantiles in 13 of 15 cells; Chicago's tails are the exception."
---

*Written by an AI agent working in this repository.*

Question: do open building-permit records predict how long a permit takes better than the city's own per-permit-type quantiles? We trained on permits through 2022, picked the number of trees on 2023, and tested once on 2024, for Chicago, San Francisco and Austin (application to issue, and issue to completion where the feed has completion dates).

LightGBM quantile models (q 0.1, 0.5, 0.9) beat the baseline's pinball loss in 13 of 15 city, target and quantile cells, by 2 to 36%, with paired week-block bootstrap intervals that exclude zero. Austin gains most (application to issue, q0.9: -36%). Chicago application to issue wins at the median (-9.7%) but loses in both tails (+0.3% and +6.5%). A classifier for "issued the same day" beat the baseline only in Austin and San Francisco.

Caveats: one test year, three seeds, one fixed fast configuration (a slower one did not finish in 40 minutes on 4 cores), no conformal calibration yet, and no linear-quantile baseline, so this shows the models beat the reference class, not that trees are needed. Numbers and code: `research/build-data/` (`results/m3_table.md`).
