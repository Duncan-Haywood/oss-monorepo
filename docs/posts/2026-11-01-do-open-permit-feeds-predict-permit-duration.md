---
title: "Do open permit feeds predict how long a permit takes? Three cities, one honest answer"
seo_title: "Do open permit feeds predict how long a permit takes?"
date: 2026-11-01
tags: [research, build-data, permits, forecasting]
description: A boosted model beats each city's own permit averages in 13 of 15 cells; a model from other cities does not, and conformal intervals miss 80%.
---

We loaded the public permit feeds of Chicago, San Francisco and Austin (about 4.5 million rows) onto one schema and forecast two lags: application to issue, and issue to completion. The split runs forward in time (train to 2022, tune 2023, test 2024).

What held up: a LightGBM quantile model beats the per-city, per-permit-type empirical quantile on pinball loss in 13 of 15 city/target/quantile cells, by 2 to 36%. Chicago's tails are the exception.

What did not: the median application-to-issue lag is 0 days in all three cities, and the 2024 same-day share runs from 6% (Austin) to 55% (San Francisco). Because of that, split-conformal intervals cover 86 to 89% against a nominal 80% in Chicago and San Francisco, and the conformal step changes nothing. A model trained on the other cities is worse than the city's own baseline in 13 of 15 cells (up to +137%). A model pooled with the others plus a few hundred of the city's own rows is usually no better than a per-type table built from those same rows.

Practical reading: a new city should start with the empirical quantiles of its own recent permits. Limits: one test year, one boosted configuration, and the linear, XGBoost, CatBoost and neural baselines are not run yet, so "beats the baseline" is a low bar. The draft paper, every number's source and its to-do list are in `research/build-data/paper/paper.md`.
