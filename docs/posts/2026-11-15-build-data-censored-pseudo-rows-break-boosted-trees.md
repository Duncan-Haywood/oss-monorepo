---
title: "Teaching a boosted model that unfinished builds are long ones made its tail forecasts 85 days worse"
seo_title: "Censored pseudo-rows in LightGBM quantile models: why they fail"
date: 2026-11-15
description: "Kept as Portnoy-style censored pseudo-rows, permits still open on the decision date push LightGBM's 0.9-quantile leaves to decades. Weights work better."
tags: [research, build-data, construction, censoring, quantile-regression, lightgbm, survival-analysis]
---

# Teaching a boosted model that unfinished builds are long ones made its tail forecasts 85 days worse

The build-data programme forecasts how long a building takes from permit issue to completion. The model is trained on other cities' open permit feeds and then used in a city it has never seen. A model you could actually ship on 1 January only knows the build times of permits that had finished by then. [The last session](2026-11-14-build-data-weights-cannot-see-past-the-window.md) found that 55 to 65% of the source permits it has to drop take longer than *any* permit of their year has been open. Reweighting the finished permits (IPCW) can't stand in for them, and the natural next step was to keep them as lower bounds: "this build took at least 700 days".

The textbook tool for that is Portnoy's censored regression quantiles (JASA 2003). Each still-open permit gets a quantile level from a Kaplan-Meier curve, here per source city and work class. Above that level its mass is split between its window and "+infinity". For linear quantile regression the +infinity label is harmless, because the fit only looks at which side of the line each point falls on.

We wrote five predictions down before running. The method should get the tail within a day of the model trained in hindsight, recover at least half of what dropping the open permits costs, and beat IPCW in the deployable model. All five failed, badly.

## The result

Change in 0.9-quantile pinball loss on the test year, in days, against the model trained with complete labels (cascade2 work-type class, 3 seeds, fresh pull of all three feeds; lower is better):

| city, test year | drop open permits | + IPCW weights | + censored pseudo-rows | pseudo-rows, capped |
|---|---|---|---|---|
| deployable model | | | | |
| San Francisco 2021 | +3.28 | **+1.77** | +8.94 | +1.69 |
| San Francisco 2022 | +1.63 | **+0.99** | +43.82 | +6.18 |
| Seattle 2021 | +10.28 | **+4.16** | +194.94 | +31.91 |
| Seattle 2022 | +3.78 | **+3.20** | +92.03 | +18.32 |
| mean | +4.74 | **+2.53** | +84.93 | +14.52 |

With the hindsight model's early stopping, the pseudo-rows make it worse too: +36.4 days on average, against +2.8 for simply dropping the open permits. The tail model stops after one or two boosting rounds, so even the first round hurts.

## Why

LightGBM's quantile objective grows each tree from the sign of the residuals, like the linear fit does. Then it does one more thing: it resets every leaf to the weighted percentile of the residuals that fall in it. Suppose more than a tenth of a leaf's weight is open permits pushed to "+infinity". Its 0.9 percentile is then a +infinity row, and the leaf jumps by tens of thousands of days. The open permits are only half a percent of the rows, and no city-class group has more than 2.7% of its weight there. But trees are built to find the corners where they cluster, such as costly new construction issued long ago.

We tried one fix after seeing the first cells, and labelled it post hoc: put the upper pseudo-row at the longest build ever completed in the same city and class, not at +infinity. That halves the damage. It doesn't remove it, because the feeds record "completed" builds of 12 to 60 years (Austin's electrical permits include one of 21,987 days), almost certainly record errors. Additive trees also stack leaves past any single label. The capped model still predicts up to 25,600 days for some test permits, and over 10 years in 33 of 36 runs.

## What this means if you fit quantiles on censored data with boosted trees

- Don't feed censored rows to a boosted quantile model as pseudo-observations with far-right labels. The trick that is safe for linear quantile regression breaks because of leaf renewal.
- If you must use them, the loss has to charge an open row only when the prediction falls below its window, and never set a leaf's value from it. In LightGBM that means a custom objective, which also gives up the percentile renewal.
- Until then, inverse-probability-of-censoring weights on the finished rows are the better correction here. They halve the deployable model's tail cost and never produce a decades-long forecast.

The code is `censored_pseudo` in [`src/transfer.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/transfer.py) and the variants in [`src/rounds.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/rounds.py). The numbers are in [`results/rounds_score_cens_i2c_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/rounds_score_cens_i2c_summary.json) and [`results/cens_reach_i2c.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/cens_reach_i2c.json), and the full log with every prediction is session 89 of [`LOG.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md). The next session writes that censored-pinball objective.
