---
title: "39% of San Francisco's permits are never marked complete, and a model that believes them breaks"
seo_title: "Never-completed building permits in build-time forecasts"
date: 2026-11-15
description: "SF has no completion date for 39% of issued permits, flat since 2010. Read as censored builds they wreck a quantile model; a 5-year staleness rule fixes it."
tags: [research, build-data, construction, censoring, quantile-regression, lightgbm, open-data]
---

# 39% of San Francisco's permits are never marked complete, and a model that believes them breaks

The build-data programme forecasts how long a building takes from permit issue to completion. It trains on other cities' open permit feeds and is used in a city it has never seen. [The last session](2026-11-15-build-data-censored-pinball-objective.md) gave LightGBM a censored pinball loss. A permit still open on the forecast date is charged only while the prediction is below its window: "this build took at least 700 days". That closed two-thirds of the gap between a model you could ship on 1 January and one trained with hindsight labels.

One shortcut remained. The data frame had dropped every permit that the feed *never* marks complete. A real deployment on 1 January sees those permits as open too, so this session put them back.

## How many there are

| city | issued permits | no completion date | share |
|---|---|---|---|
| San Francisco | 1,233,169 | 484,215 | 39% |
| Seattle | 141,311 | 33,077 | 23% |
| Austin | 2,381,901 | 199,042 | 8% |

The share doesn't fall for older permits. In San Francisco it is 35 to 42% for every issue year from 2010 to 2019. These are not builds still running after fifteen years. San Francisco's feed has a status field, and a group-by on it shows what they are. 246,263 still read "issued", 229,398 "expired" and 6,210 "cancelled". In every issue year from 2010 to 2019, 30 to 39% of permits are still "issued" with no completion date. Most of them are records nobody closed out.

## What the model does with them

Change in 0.9-quantile pinball loss on completed test-year permits, in days, against the model trained with complete labels (cascade2 work-type class, 3 seeds; lower is better):

| city, test year | last session | + all never-completed permits | + those open ≤ 5 years only |
|---|---|---|---|
| San Francisco 2021 | **+0.86** | +35.04 | +2.46 |
| San Francisco 2022 | **+0.23** | +34.50 | +3.10 |
| Seattle 2021 | +2.94 | +311.47 | **−3.95** |
| Seattle 2022 | +2.48 | +343.71 | **−3.22** |
| mean | +1.63 | +181.18 | **−0.41** |

Read as "at least this long", the never-closed permits wreck the tail. Seattle's model borrows from San Francisco and Austin, so it inherits more than half a million of them. Up to 71% of its q0.9 forecasts pass ten years, the largest at 11,756 days. The loss isn't wrong about the label it's given. The label is wrong, because "not completed" in these feeds mostly means "not recorded".

The rule fixed before the run was to drop any permit that has been open for more than five years on the forecast date. It needs nothing a deployment lacks, and it turns the damage into a gain. On average it is the first deployable variant in six sessions to match the hindsight model. Seattle gets 5.7 to 6.9 days better than last session's model, so recent open permits carry real tail information there. San Francisco gets 1.6 to 2.9 days worse, so five years is not the right cut for every mix of source cities.

We also scored every test-year permit, counting the never-completed ones as lower bounds at the pull date. On that score the five-year rule beats last session's model in all four city-years, by 25 to 32 days. That score is generous to long forecasts, so it can't settle the question on its own.

We wrote five predictions down before the run. Three held: the never-completed permits hurt on completed rows in 4 of 4 city-years, they help on the all-permit score in 3 of 4, and the rerun reproduced last session exactly. Two were refuted. The staleness rule was predicted to land within a day of last session's model and came out 2 days better. The median model was predicted to lose at most a day and lost 12.8.

## Caveats

- One staleness threshold, chosen in advance and not swept. One work-type class, 3 seeds, no Austin cells this time, and no 0.1 quantile.
- No intervals on the loss changes. Per-seed losses are now saved: the five-year rule's seed spread is 0.5 to 2 days. That is smaller than its Seattle gains but about the size of its San Francisco costs.
- The status field was only used to describe the permits, never as a model input. Only San Francisco's feed was checked.

## If you forecast durations from administrative records

Check whether "no end date" means "still running" or "nobody recorded it". Survival models assume the first. Plot the open share by start year. If it doesn't fall towards zero for old records, a large part of your censoring is really a missing outcome. The next step here treats closing out as a competing risk: model the chance that a permit is ever marked complete, and weight each open permit by it.

The numbers are in [`results/rounds_score_nc_i2c_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/rounds_score_nc_i2c_summary.json) and [`results/sf_never_completed_status.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/sf_never_completed_status.json). The full log, with the predictions written before the run, is session 91 of [`LOG.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md).
