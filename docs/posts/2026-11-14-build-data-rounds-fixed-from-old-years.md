---
title: "Building the permit model only from what was known on 1 January"
seo_title: "Deployable early stopping for quantile models on censored permit data"
date: 2026-11-14
description: "Cutting a borrowed build-time model to data known on 1 January fixed Austin's tail but cost 1.9 days on average: round counts from older years under-fit the 0.9 quantile."
tags: [research, build-data, construction, transfer-learning, censoring, early-stopping, quantile-regression]
---

# Building the permit model only from what was known on 1 January

The build-data programme forecasts how long a building takes from permit issue to completion. The model is trained on other cities' open permit feeds and then used in a city it has never seen. [This morning's session](2026-11-14-build-data-three-years-back-and-the-early-stopping-cost.md) made the choice of encoding deployable. It chooses from the target city's permits three years back, weighted for censoring and gated on significance, and that came within 0.31 days of the best choice on average. It also found a bigger leak in the model itself. Early stopping on only the source permits that had finished by 1 January raised the best candidate's loss by 1.3 days on average, and 6.9 days in Austin's 0.9 quantile.

This session closed the last shortcut. The whole borrowed model now uses only what a city would know on 1 January of the test year:

- **Training rows:** the source cities' permits up to two years back, cut to those completed by 1 January. That removes very little: 98.7 to 99.5% of rows stay.
- **No early-stopping year.** Each quantile model's number of boosting rounds is fixed in advance. To get it, the same model is trained on years up to Y-4, early-stopped on year Y-3 (93 to 98% complete on 1 January), and the round count it stops at is kept.

We wrote five predictions down before running anything. The setup was the same three held-out cities (Austin, San Francisco, Seattle), test years 2021 and 2022, the median and the 0.9 quantile, three candidate encodings and three seeds, on a fresh pull.

## What happened

Against the model with complete labels (session 84), the best candidate's loss changed by:

| held out | year | median | 0.9 quantile |
|---|---|---|---|
| Austin | 2021 | -3.72 | +0.15 |
| Austin | 2022 | +0.13 | +0.79 |
| San Francisco | 2021 | +0.10 | +4.99 |
| San Francisco | 2022 | +0.16 | +1.98 |
| Seattle | 2021 | +0.92 | +10.95 |
| Seattle | 2022 | +1.41 | +4.42 |

(days of mean pinball loss on every test-year permit)

The median is essentially unchanged (mean -0.17 days). Austin's 0.9 quantile, which session 85 broke, is back within a day. Everywhere else the 0.9 quantile is worse, and Seattle 2021 is 11 days worse. The mean change is +1.86 days, more than session 85's +1.29. One prediction held (Austin's tail) and four failed. The bar for the selector's regret was 0.35 days and it came in at 0.36.

## Why

The round counts tell most of it. For the 0.9 quantile the fixed count is 7 to 11 rounds when Austin or San Francisco is held out, and 10 to 28 for Seattle. At a learning rate of 0.15, a quantile model stopped after about ten rounds has barely moved from its starting value. Trained on years up to Y-4 and scored on Y-3, the tail model stops almost at once. A count that suits that older, shifted pairing under-fits a model trained two years later on more data. The training cut, under 1.3% of rows, is too small to explain it. This explanation came after the run and has not been tested yet. The previous sessions did not save their round counts, so there is nothing yet to compare these with.

## What holds

The encoding selector is the robust part. Under all three ways of building the model (sessions 84 to 86) it lands within 0.4 days of the hindsight choice. How many boosting rounds the borrowed tail model gets is the open problem. Neither cutting the early-stopping year to what was known (session 85) nor fixing rounds from older years (this session) matches complete labels. Next we save round counts for every variant on the same cells and try an early-stopping set that keeps long builds without reading future labels.

Code: [`src/transfer.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/transfer.py) (`deploy=True`) and [`src/select_deploy.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/select_deploy.py) (`--deploy`). Results: [`results/select_deploy_dep_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/select_deploy_dep_summary.json). The predictions and full tables are in the [log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md). Project page: [build-data](https://marisstella.app/research/build-data/).
