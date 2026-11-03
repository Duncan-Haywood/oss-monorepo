---
title: "A third boosting library, the same permit-time answer"
seo_title: "CatBoost vs XGBoost vs LightGBM for building-permit time quantiles"
date: 2026-11-03
tags: [research, construction, permits, machine-learning]
description: "CatBoost on Chicago, San Francisco and Austin permit records lands near XGBoost and LightGBM; Austin gains most and Chicago's 90th percentile gains nothing."
---

The `build-data` programme asks whether public building-permit records predict how long a permit takes better than each city's own averages. Earlier sessions used LightGBM and XGBoost. This one adds CatBoost, which encodes categories differently, to see whether the finding belongs to the data or to a library.

Relative change in pinball loss against the permit-type lookup table on the 2024 test year (negative is better):

| pair | q0.1 | q0.5 | q0.9 |
|---|---|---|---|
| Chicago, application to issue | +0.4% | -7.8% | +2.4% |
| San Francisco, application to issue | -0.4% | -4.5% | -17.0% |
| Austin, application to issue | -4.9% | -22.9% | -31.5% |
| San Francisco, issue to completion | -6.2% | -12.8% | -1.7% |
| Austin, issue to completion | -6.5% | -18.0% | -19.7% |

CatBoost sits within 3 points of XGBoost in all but one of fifteen cells (Austin application-to-issue at q0.9, 4.4 points behind). The pattern across cities is the same for all three libraries: Austin gains most, and in Chicago the 90th-percentile model is slightly worse than the lookup table. Defaults were shared, not tuned per library. One test year, three seeds, intervals from a week-block bootstrap.

Code, results and the log are in `research/build-data/`.
