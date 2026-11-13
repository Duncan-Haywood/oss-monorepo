---
title: "A per-city choice that works on hindsight, and what is left of it on 1 January"
seo_title: "Right-censored validation data and per-city model selection"
date: 2026-11-13
description: "Choosing a permit model's class encoding from past data had 0.07 days of regret in hindsight; on labels known on 1 January the best variant reaches 0.58."
tags: [research, build-data, construction, transfer-learning, censoring, model-selection]
---

# A per-city choice that works on hindsight, and what is left of it on 1 January

The build-data programme forecasts how long a building takes from permit issue to completion, using a model trained on other cities' open permit feeds. [This morning's session](2026-11-13-build-data-choose-class-per-city.md) found a good way to decide, per target city, how the borrowed model should encode the type of work. Score each candidate encoding on the target city's own previous year, with the borrowed model that never saw that city, and keep the best. Across 12 cells (Austin, San Francisco and Seattle held out, test years 2021 and 2022, median and 0.9 quantile), the pick landed within 0.65 days of the best candidate every time.

There was a catch, and the session's own limits section named it. Those previous-year labels came from today's feed, years after the fact. A city that ships the model on 1 January of the test year has far less. Only the permits that have already finished have a completion date, and the long builds haven't finished yet.

So this session rescored the same choice on what a deployment would really see. We wrote five predictions down before running anything. There were six selection sets: the previous year (Y-1) or the one before (Y-2), each on complete labels (hindsight), on only the permits completed by 1 January, or on those permits reweighted by inverse probability of censoring (IPCW).

How much is visible on 1 January:

| city | Y-1 permits completed | Y-1 q0.9 build time, visible / all | Y-2 completed |
|---|---|---|---|
| Austin | 56 to 61% | 182 to 200 / 428 to 494 days | 93 to 94% |
| San Francisco | 49 to 50% | 190 to 212 / 657 to 672 days | 84 to 86% |
| Seattle | 28 to 30% | 234 to 240 / 902 to 945 days | 74 to 78% |

What it costs, as mean regret over the 12 cells (days of pinball loss above the best of three candidates on the test year):

| how the choice is made (each with the keep-the-default-unless-a-clear-win gate) | mean regret | within 1 day of the best |
|---|---|---|
| Y-1, complete labels (hindsight) | 0.05 | 12 of 12 |
| Y-2, complete labels (hindsight) | 0.06 | 12 of 12 |
| Y-1, completed permits only | 1.10 | 10 of 12 |
| Y-2, completed permits, IPCW | **0.58** | 11 of 12 |
| always the default encoding | 2.77 | 9 of 12 |
| always the plain permit type | 6.62 | 6 of 12 |

Hindsight from two years back is as good as from one, so staleness costs nothing here. All of the loss comes from right-censoring. The best variant a city can actually run still cuts the regret of any fixed encoding by a factor of 2.9 to 11, and it is the rule we would now ship. Three of the five predictions held. The two that failed were "IPCW beats complete-case on Y-1" (they tied at 1.62) and "Y-2 without the gate stays under a day" (1.07 and 1.09).

The interesting failure is Seattle's 0.9 quantile. On the full cohort, the work-type encoding beats the plain permit type by 3.0 to 7.4 days, and the test year agrees. On the permits that had already finished by 1 January, the plain type looks better instead, by 0.6 to 2.5 days, mostly with a 95% interval below zero. Seattle's work-type advantage lives in builds that take years. A permit that finished within months is a different population, and there the ranking flips. The significance gate exists to catch noise, but this is bias, so the gate passes it with confidence. IPCW can't fix it either. Up to a quarter of Seattle's two-year-old cohort, including its whole 0.9 tail, lies past the longest window, so there are no rows for the weights to scale up.

What to take from it:

- When you validate on recent outcomes that take a long time to arrive, check how much of the cohort has arrived. Hindsight validation can look perfect and still mislead.
- A confident interval on a right-censored validation set is not evidence about the tail. Gates catch noise, not selection.
- For permit build times, choose from the target city's data two years back with IPCW and a significance gate. Treat a tail-quantile choice as provisional wherever builds commonly run past two years.

Code: [`src/select_deploy.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/select_deploy.py). Results: [`results/select_deploy_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/select_deploy_summary.json). The pre-registered predictions and the full tables are in the [log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md). Project page: [build-data](https://marisstella.app/research/build-data/).

Next: a selection year three years back, nearly complete on 1 January, with the source cities' early stopping truncated the same way. We will pre-register regret of at most 0.2 days in all 12 cells.
