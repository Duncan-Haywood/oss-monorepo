---
title: "Half a percent of permits: where a deployable build-time model loses its tail"
seo_title: "Censored training data costs a quantile model its tail"
date: 2026-11-14
description: "The boosting-round count didn't explain the deployable permit model's tail loss. Dropping the 0.5% of permits still open on 1 January did: 1 to 5 days at q0.9."
tags: [research, build-data, construction, transfer-learning, censoring, early-stopping, quantile-regression]
---

# Half a percent of permits: where a deployable build-time model loses its tail

The build-data programme forecasts how long a building takes from permit issue to completion. The model is trained on other cities' open permit feeds and used in a city it has never seen. For three sessions we have been making that model deployable. That means building it only from what a city would know on 1 January of the year it forecasts. Each step cost accuracy at the 0.9 quantile, the "how long could this run" number that schedules and contingencies are built on.

[This morning's session](2026-11-14-build-data-rounds-fixed-from-old-years.md) fixed each model's number of boosting rounds in advance, using older years. The 0.9-quantile models stopped after 7 to 28 rounds and lost 1.9 days on average. Our guess was that the round count was the problem: a count learned on old years under-fits a model trained later on more data. This session tested that guess, and it did not hold up.

## Test 1: early-stop on a nearly complete year instead

If carrying a round count from older years is the problem, the fix is to stop carrying one. The new variant trains the borrowed model on the source cities' years up to Y-4 plus Y-2. It early-stops directly on year Y-3, which is 93 to 98% complete on 1 January, so its long builds are mostly there. Every training row is still cut to permits finished by 1 January. We wrote down five predictions before running. The setup was the same as before: Austin, San Francisco and Seattle each held out in turn, test years 2021 and 2022, the median and the 0.9 quantile, three candidate encodings and three seeds, on a fresh pull.

Four of the five predictions failed. The 0.9-quantile models still stop after 8 to 17 rounds in 5 of 6 city-years. The best candidate's loss against the complete-label model rises by 1.63 days on average, against 1.86 for this morning's model. At the 0.9 quantile only Austin is within a day.

## Test 2: does the round count track the loss at all?

Earlier sessions never saved their round counts, so we refitted the borrowed model (the work-type encoding) under each set-up on the same cells:

| held out, year | complete labels | early stop on finished Y-1 | count from older years | early stop on Y-3 |
|---|---|---|---|---|
| Austin 2021 | 34 | 51 | 7.7 | 8.3 |
| Austin 2022 | 44 | 239 | 8.7 | 8.7 |
| San Francisco 2021 | 121 | 30 | 9.7 | 13.7 |
| San Francisco 2022 | 88 | 44 | 10.3 | 16.7 |
| Seattle 2021 | 50 | 32 | 12.3 | 14.3 |
| Seattle 2022 | 84 | 50 | 21 | 148 |

(0.9-quantile boosting rounds, mean of 3 seeds)

Early stopping on year Y-3 does make the tail model stop early. But across the 18 model-cells the round count does not track the tail loss: the Spearman correlation is 0.02. Austin gains 8 to 12 days with 8 rounds. Austin 2022 loses 2.8 days with 239 rounds. Seattle 2022 loses 3.8 days with 148 rounds.

## Test 3: the training cut alone

The two variants that lose most in San Francisco and Seattle share one more thing. Both drop the source permits whose builds had not finished by 1 January. That cut looked harmless because it removes so few rows: 0.45 to 0.56% for San Francisco and Seattle. This morning's write-up dismissed it on that count. We wrote two more predictions down, then fitted session 84's complete-label model with only that cut applied.

The uncut refit matches session 84's losses to 0.001 days in all 12 cells, so the fresh pull is the same data. The cut alone raises the 0.9-quantile loss by 1.45 and 1.03 days in San Francisco and by 5.14 and 3.49 days in Seattle. That is 44 to 92% of the deployable model's cost in those cells, while its round counts stay near the complete-label model's. We had predicted more than 2 days in 3 of the 4 cells, and it happened in 2, so the prediction failed as worded. The direction is clear all the same.

The half percent it drops is not a random half percent. It is the longest builds, the ones still open on the decision date, and those are exactly what a 0.9 quantile has to learn. Austin goes the other way: its borrowed tail was already too long (sessions 80 to 82), so it gains 2.3 and 5.7 days from losing them.

## What it means

If you train a quantile model on a feed where long jobs finish late, dropping the unfinished ones is not a rounding error. Here 0.5% of the rows carried up to 5 days of tail loss. A deployable model has to keep their weight without seeing their labels. The next step does that with inverse-probability-of-censoring weights on the finished training rows, the same correction the encoding selector already uses, and we have written down its target in advance.

Limits: one encoding in the round and cut analyses, no intervals on these loss changes, and the cut test was designed after the main runs.

Code: [`src/transfer.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/transfer.py) (`es3=True`), [`src/rounds.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/rounds.py). Results: [`results/rounds_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/rounds_summary.json), [`results/rounds_score_i2c.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/rounds_score_i2c.json), [`results/select_deploy_es3_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/select_deploy_es3_summary.json). The predictions and full tables are in the [log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md). Project page: [build-data](https://marisstella.app/research/build-data/).
