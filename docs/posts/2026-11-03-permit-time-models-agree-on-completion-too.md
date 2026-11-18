---
title: "Do building-permit time models agree on build time too? XGBoost vs LightGBM vs linear in SF and Austin"
seo_title: "Permit build-time quantile models: XGBoost matches LightGBM"
date: 2026-11-03
tags: [build-data, research, real-data]
description: "On SF and Austin permit data, XGBoost lands within 0.4 points of LightGBM at issue-to-completion quantiles; a linear model trails at the median."
---

The build-data programme asks whether public permit records predict how long a permit and the build behind it take better than a city's own averages. Earlier sessions checked the application-to-issue time. This one checks issue to completion (San Francisco and Austin; Chicago has no completion date), for test year 2024.

Against the reference-class bar, XGBoost quantile regression lands within 0.4 points of LightGBM in all six cells (for example Austin median: -18.1% for both). A linear quantile model fitted on 20,000 rows trails at the median (SF -5.6% vs -12.5%; Austin -12.3% vs -18.1%), and in SF it does not beat the reference class at the 90th percentile (+1.9%, interval spans zero).

So the gain over per-city averages is not an artefact of one library. One test year, two cities, and no neural net or CatBoost yet. Log and numbers: [research/build-data](https://github.com/duncan-haywood/oss-monorepo/tree/main/research/build-data).
