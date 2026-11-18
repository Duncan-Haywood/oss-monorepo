---
title: "Reweighting finished permits halves the tail cost, but can't bring back what never finished"
seo_title: "IPCW on right-censored training data: what the weights recover"
date: 2026-11-14
description: "Inverse-probability-of-censoring weights cut a deployable permit model's 0.9-quantile cost from 4.7 to 2.5 days, but most dropped permits outlast every window."
tags: [research, build-data, construction, transfer-learning, censoring, ipcw, quantile-regression]
---

# Reweighting finished permits halves the tail cost, but can't bring back what never finished

The build-data programme forecasts how long a building takes from permit issue to completion. The model is trained on other cities' open permit feeds and then used in a city it has never seen. [This afternoon's session](2026-11-14-build-data-half-a-percent-of-permits.md) found where a model you could actually deploy on 1 January loses to one trained in hindsight. It has to drop the source permits whose builds had not finished by that date. Those are only 0.45 to 0.56% of the training rows in San Francisco and Seattle, but they cost up to 5 days of 0.9-quantile loss, because they are the longest builds.

The standard fix for that is inverse-probability-of-censoring weighting (IPCW). Keep the finished permits, and give each one more weight the less likely a permit with its build time was to have finished by the decision date. Each source city-year's issue dates are known in full on 1 January, so that probability can be computed without any future labels. The encoding selector in this programme already uses the same correction.

We wrote five predictions down before running anything. We fitted the borrowed model (the cascade2 work-type encoding, 3 seeds) with each city held out in turn, for test years 2021 and 2022, on a fresh pull. The two variants that keep the complete-label model's early stopping reproduce the last session's losses exactly, to 0.000 days.

## The result

Change in 0.9-quantile pinball loss on the test year against the complete-label model, in days (lower is better):

| city, test year | cut, no weights | cut + IPCW | deployable (es3) | deployable + IPCW |
|---|---|---|---|---|
| San Francisco 2021 | +1.45 | +1.19 | +3.28 | **+1.77** |
| San Francisco 2022 | +1.03 | +0.69 | +1.63 | **+0.99** |
| Seattle 2021 | +5.14 | +4.06 | +10.28 | **+4.16** |
| Seattle 2022 | +3.49 | +2.52 | +3.78 | **+3.20** |
| mean | +2.78 | +2.12 | +4.74 | **+2.53** |

In the model you could actually ship, the one that trains and early-stops only on what was known on 1 January, the weights help in all four city-years and cut the mean tail cost from 4.74 to 2.53 days. That prediction held. In Seattle 2021 the weighted early-stopping set also lets the tail model train for 121 boosting rounds instead of 14.

The other four predictions failed. We expected the weights to bring the cut model back within a day of hindsight in 3 of 4 city-years. That happened in 1. They recover 18 to 33% of the cut's cost, never the half we predicted. The median quantile also moves in Seattle, by about 1 day.

## Why weights cannot finish the job

After the first cell came back weak, we counted something we had not planned to (no model fitted). Take the source permits the cut drops. For 55 to 65% of them, the build took longer than the longest window any permit in their city and year had on 1 January. Take a permit issued in early 2020 and still open in January 2022. No finished permit from 2020 has a build time that long. The censoring probability for it is zero, so no weight on a finished row can stand in for it.

The weights add back 29 to 39% of the dropped rows' count. They move the training set's 99th percentile of build time by 10 to 25 days out of a 159 to 323-day gap, so they close less than a tenth of it.

## What it means

If your training labels are durations that a deadline right-censors, IPCW is the right tool for the part that is random censoring, and here it is worth having: it halves the deployable model's tail cost. But it only reweights durations that some row has already shown. The longest jobs are exactly the ones beyond every window, and a weight cannot reach them. To get them back, a model has to use the open permits themselves, as lower bounds: "this build has taken at least 730 days so far". That means a censored quantile loss rather than a weighted one. It is the next step, and its bar is the 2.53 days set here.

Limits: one encoding; no intervals on these loss changes; the deployable variant weights both its training and early-stopping rows, so the two effects are not separated; a planned sensitivity run with a weaker weight cap was not done; and the window diagnostic was designed after seeing the first cell.

Code: [`src/transfer.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/transfer.py) (`ipcw_completed`), [`src/rounds.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/rounds.py) (`ipcw_cut`, `ipcw_es3`), [`src/ipcw_reach.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/ipcw_reach.py). Results: [`results/rounds_score_ipcw_i2c_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/rounds_score_ipcw_i2c_summary.json), [`results/ipcw_reach_i2c.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/ipcw_reach_i2c.json). The predictions and full tables are in the [log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md). Project page: [build-data](https://marisstella.app/research/build-data/).
