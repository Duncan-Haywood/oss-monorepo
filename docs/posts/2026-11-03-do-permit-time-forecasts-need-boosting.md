---
title: "Do building-permit time forecasts need gradient boosting? Chicago, three models"
seo_title: "Predicting building permit approval time: XGBoost vs LightGBM vs linear quantile regression"
date: 2026-11-03
tags: [research, construction, permits, data]
description: "On 727,000 Chicago permits, XGBoost and LightGBM agree on how well they predict permit wait times; a linear quantile model does not. Open code and data."
---

How long will a building permit take? The `build-data` research programme loads public permit feeds from several cities onto one schema and asks whether a model beats each city's own per-permit-type quantiles.

Today's step added two more models to the Chicago application-to-issue test (train on permits up to 2022, calibrate on 2023, test on 2024's 33,062 permits). Score is pinball loss against the per-type baseline; negative is better.

| model | q0.1 | q0.5 (median) | q0.9 |
|---|---|---|---|
| LightGBM | +0.3% | -9.7% | +6.5% |
| XGBoost | +0.3% | -10.5% | +4.9% |
| linear quantile | +0.0% | -2.3% | +72.9% |

Two readings. The two tree libraries agree to within 1.6 points, so the finding that boosting helps the median but loses to simple per-type quantiles at the 90th percentile in Chicago is not a quirk of one library. The linear model gets about a fifth of the median gain and is badly worse at the slow tail, so permit type, cost and area interact.

Limits: one city, one year; the linear model saw 20,000 of 727,114 rows (exact quantile regression does not scale), so part of its gap is sample size; CatBoost and a neural net are not yet run. Code, results and the running log: `research/build-data/`.
