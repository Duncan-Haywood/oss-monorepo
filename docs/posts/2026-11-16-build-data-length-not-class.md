---
title: "Was it the withdrawn permits, or just their length? A placebo test on a borrowed build-time forecast"
seo_title: "Withdrawn permits or their length? A build-time forecast placebo"
date: 2026-11-16
description: "Dropping live permits with the same build times as Austin's withdrawn ones reproduces most of the effect on a borrowed Seattle and San Francisco forecast."
tags: [research, build-data, construction, open-data, data-quality]
---

# Was it the withdrawn permits, or just their length? A placebo test on a borrowed build-time forecast

The build-data programme forecasts how long a construction permit takes from issue to completion, using open permit feeds from San Francisco, Seattle and Austin. A model trained on two cities forecasts the third. The [last post](2026-11-16-build-data-stamps-were-not-the-cost.md) found something odd. About 28,000 to 31,000 training rows belong to permits the city calls dead (mostly Austin permits marked withdrawn) that still carry a completion date. Dropping them made the forecast of the slowest tenth of Seattle's builds (the 0.9 quantile) worse by 1.75 to 2.52 days, and San Francisco's slightly better.

Those rows have long durations: their 90th percentile is about 1,080 days, nearly three times a finished permit's. So there were two explanations. Either these permits matter because they are closures, or because they are long. Any long rows would then do the same job.

## The placebo

We kept the closures and instead dropped the same number of ordinary, finished permits with the same lengths. For each source city we split the closures' build times into ten bins, then removed at random that many finished permits from each bin. If length is what matters, this placebo should do what dropping the closures did. If it is the closure itself, the placebo should do nothing. We committed six predictions before any model ran.

| Held-out city, year | keep closures | drop closures | drop length-matched live permits | drop closures over 1 year |
|---|---|---|---|---|
| San Francisco 2021 | 72.77 | 72.49 | 72.29 | 72.62 |
| San Francisco 2022 | 62.28 | 61.03 | 61.64 | 61.37 |
| Seattle 2021 | 86.60 | 89.12 | 88.07 | 88.50 |
| Seattle 2022 | 70.00 | 71.75 | 70.73 | 71.12 |

*Mean pinball loss at the 0.9 quantile in days, lower is better, 3 seeds, completed test permits. Every column also drops Austin's 180-day expiry stamps and any source permit open more than five years.*

## Mostly length

In San Francisco the placebo helps in all six seed-by-year runs (by 0.48 and 0.64 days), close to what dropping the closures did (0.28 and 1.25). In Seattle it costs 1.47 and 0.73 days, about half of the closures' cost. In every cell, removing either set lowers the model's average 0.9-quantile forecast. The long rows were holding the borrowed tail up. That helps Seattle, whose builds run long, and hurts San Francisco, whose builds are shorter.

So most of the effect comes from how much long-tail data the model sees, not from what kind of permit it is. About one day of Seattle's cost stays specific to the closures. That is within the seed-to-seed spread of a single cell, so this run cannot tell whether it is real. The closures over a year long are 40 to 44% of the set and carry 64 to 75% of Seattle's cost.

## Predictions

Three of six held: the check that the refit reproduces last session's model to every digit (L0), the placebo matching every closure (L1), and the placebo helping San Francisco (L3). Three were refuted. The placebo did not cost Seattle at least a day in both years (L2: +1.47, +0.73). The long closures carried 75% of Seattle's cost in 2021 but only 64% in 2022 (L4). And they are 40 to 44% of the closures, not at most 40% (L5).

## What a practitioner can take from it

Thinning the long tail of a borrowed training set is a decision for each target city, whichever rows you thin. It helps a city with short builds and hurts one with long builds. The cleaning rule from last time stands: drop Austin's 180-day expiry stamps, and keep the other dead close-outs rather than treating them as noise. The next step is to let the target city's own older, completed permits choose among these source rules, since a source-side score has already failed at that.

Limits: 0.9 quantile only, 3 seeds and one placebo draw, San Francisco and Seattle held out, Austin not. The length match is per source city, not per permit class.

Code, data pull and results: [`research/build-data`](../../research/build-data/README.md), session 97 in [`LOG.md`](../../research/build-data/LOG.md), numbers in [`rounds_score_len_i2c_summary.json`](../../research/build-data/results/rounds_score_len_i2c_summary.json). Not engineering, legal or financial advice.
