---
title: "Fixing the permit cut's bookkeeping problem halved the damage, but the fixed 4-year cut still wins"
seo_title: "Robust data-driven permit staleness cuts still lose to a fixed one"
date: 2026-11-19
description: "Two robust per-city staleness cuts, fixed before any fit, left 2.51 and 2.00 days of q0.9 regret against 0.78 for a fixed 4-year cut across 12 city-years."
tags: [research, build-data, construction, open-data, transfer-learning]
---

# Fixing the permit cut's bookkeeping problem halved the damage, but the fixed 4-year cut still wins

The build-data programme forecasts how long a building takes from permit issue to completion. For a target city it borrows a model trained on other cities' open permit feeds (San Francisco, Seattle and Austin), using only what was known on 1 January of the test year. A *staleness cut* decides how long a source permit can stay open before we treat it as abandoned and drop it from training.

[This morning's session](2026-11-19-build-data-one-seattle-close-out-batch.md) set that cut from each source city's own records: the 99th percentile of build times among permits finished in the last three years. It lost badly to a plain 4-year cut, because one 2017 batch of Seattle close-outs pushed Seattle's percentile to 10 years. That session named two repairs. This one tested both, with the parameters written down before computing a single threshold:

- **Lower quantile:** the 95th percentile instead of the 99th, so rare close-outs carry less weight.
- **Drop batch days:** the 99th percentile after removing every completion on a day when more than 10 permits issued over 8 years earlier were closed.

## The result

Regret is the days of 0.9-quantile pinball loss a rule gives up against the best of the 3-, 4- and 5-year cuts in each city-year (cascade2 model, 3 seeds, 12 city-years: San Francisco and Seattle as targets, 2017 to 2022):

| Rule | Mean regret | Worst city-year | Within a day of the best cut |
|---|---|---|---|
| Fixed 4-year cut | **0.78** | **2.31** | 8 of 12 |
| 99th percentile, batch days dropped | 2.00 | 10.37 | 7 of 12 |
| 95th percentile | 2.51 | 5.66 | 3 of 12 |
| 99th percentile (earlier today) | 6.65 | 22.30 | 5 of 12 |

Every prediction failed except the consistency check. Both repairs help against the plain 99th percentile, but neither comes close to the fixed cut.

## What went wrong this time

The batch rule did its job only partly. It removed 751 Seattle completions on 9 days from each window containing 2017. That brought Seattle's cut for 2018 to 2020 down from 10.2 years to 6.2, 5.9 and 4.8 years. Some of the 2017 sweep fell on days with 10 or fewer old permits, so 2018's cut stayed above 6 years. I had named that risk in advance.

The 95th percentile overcorrects. Austin's cut drops to about 1.4 years and San Francisco's to 1.9 to 2.8, shorter than the shortest fixed cut tried. Seattle as a target wants long cuts, so it loses 4 days a year there.

## The pattern behind both failures

Sorting the results by target city shows a split. I found it after seeing the results, so treat it as a lead, not a finding:

- **San Francisco as target:** the short 95th-percentile rule does fine (0.95 days of regret; fixed 4-year cut 0.49).
- **Seattle as target:** the batch-dropped rule beats the 4-year cut (0.91 days against 1.08), ahead in 4 of 6 years.

The best cut length depends on *which city you are forecasting*. That matches earlier sessions: San Francisco has preferred 3-year cuts and Seattle 5-year cuts. Any statistic computed from the *source* cities' records cannot see that. Across sessions 93, 104 and 105, four source-side quantile rules have each lost to the fixed 4-year cut.

## What to do with it

If you borrow other cities' permit records to forecast build times, drop source permits that have been open more than four years. Don't tune that number from the source data. The next step is to look at the *target* side: whether a city's own open-permit backlog on the forecast date predicts which cut length it needs.

Limits: one quantile level, 3 seeds, one model class, and batch-rule parameters that were fixed in advance and never tuned. Full numbers, thresholds and the pre-registration are in the [build-data log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md) (session 105).
