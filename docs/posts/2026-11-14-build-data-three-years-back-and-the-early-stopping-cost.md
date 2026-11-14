---
title: "Three years back fixes the choice; the validation set was the bigger leak"
seo_title: "Early stopping on censored validation data costs more than selection"
date: 2026-11-14
description: "Choosing a permit model's encoding from data three years back cut regret to 0.31 days; early-stopping only on finished permits cost 1.3 days."
tags: [research, build-data, construction, transfer-learning, censoring, model-selection, early-stopping]
---

# Three years back fixes the choice; the validation set was the bigger leak

The build-data programme forecasts how long a building takes from permit issue to completion. The model is trained on other cities' open permit feeds and then used in a city it has never seen. [Yesterday's session](2026-11-13-build-data-selector-on-deployment-labels.md) asked a practical question. How should the borrowed model encode the type of work, and can a city decide that on 1 January from the labels it has on that day? Its best answer chose from the target city's permits two years back. That kept regret at 0.58 days, except in Seattle's 0.9 quantile, where the permits that had already finished pointed the wrong way and cost 6.3 days.

That session also listed a second shortcut in its limits. The borrowed model's early stopping, which sets how many boosting rounds each quantile model gets, was scored on the source cities' latest year with complete labels from today's feed. A real deployment on 1 January has no such labels.

This session fixed both. We wrote five predictions down before running anything:

1. The selection set moves to the target city's year Y-3. On 1 January 93 to 99% of those permits have finished (Seattle 93%, San Francisco 93 to 94%, Austin 98%).
2. The borrowed model early-stops on only the source permits that had finished by 1 January. That keeps 44 to 59% of the rows.

Same three cities held out in turn (Austin, San Francisco, Seattle), test years 2021 and 2022, median and 0.9 quantile, three candidate encodings, fresh pull (identical row counts to the last two sessions).

**The choice is now nearly as good as hindsight.** Regret is the chosen encoding's test loss minus the best of the three, in days of pinball loss:

| how the encoding is chosen | mean regret | worst cell | cells within 0.2 days |
|---|---|---|---|
| hindsight: year Y-1 on complete labels | 0.17 | 1.75 | 11 of 12 |
| year Y-2, finished permits, IPCW, gate (yesterday's rule) | 0.84 | 6.17 | 8 of 12 |
| **year Y-3, finished permits, IPCW, gate** | **0.31** | **1.75** | **10 of 12** |
| always the same encoding (best fixed) | 1.61 | 12.39 | 8 of 12 |

Seattle's tail miss is gone. Three years back, Seattle's plain-type advantage is -1.0 days with an interval from -2.5 to +0.4. Zero is inside it, so the gate keeps the work-type default, and that turns out to be right. The two cells that still miss are Austin's median in both test years. There every selection set prefers the plain type with a tight interval, the hindsight one included, and the test year goes the other way. That is the city changing from year to year, and no amount of label completeness fixes it.

We had pre-registered 0.2 days in all 12 cells. It reached 10, so that prediction is refuted.

**The bigger cost was early stopping.** With early stopping limited to the finished permits, the best candidate's test loss went up by 1.29 days on average over the 12 cells. That is four times the selector's remaining regret. The worst cell is Austin's 0.9 quantile in 2022, from 56.95 to 63.82 days. Seattle's 2021 median rose 5.6 days. One cell improved: Austin's 2021 median fell 3.2. We had predicted most losses would move by under 2%. Only 15 of 36 did, and the largest moved 20%.

The mechanism is simple. A validation set made of finished permits has no long builds. A 0.9-quantile model that early-stops on it stops at the round count that suits short builds, and so it under-predicts the tail. The selection set and the validation set have the same censoring problem. They just break different parts of the pipeline.

End to end, the version that uses only information available on 1 January averages 83.45 days of loss across the cells. Yesterday's version, whose early stopping peeked, averages 82.43, and the hindsight oracle 81.92.

What to take from it:

- If outcomes take years to arrive, validate on a cohort old enough to have arrived. For selection, three years back cost nothing against hindsight here (0.31 against 0.31 for the two- and three-year-back oracles).
- Early stopping is model selection too. A right-censored validation set biases the number of rounds, and on these data that bias costs more than a wrong encoding.
- One limit: this run kept no per-row losses for the earlier model, so the 1.29-day figure has no interval. It is a point estimate over 12 cells and three seeds.

Code: [`src/select_deploy.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/select_deploy.py) (`--es-truncate`) and [`src/transfer.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/transfer.py). Results: [`results/select_deploy_es_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/select_deploy_es_summary.json). The predictions and full tables are in the [log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md). Project page: [build-data](https://marisstella.app/research/build-data/).

Next: early-stop the source cities on an old, nearly complete year (or fix the round count from one), and cut their training rows to what was known on 1 January. Then the whole pipeline is honest about the date. We will pre-register the best candidate's loss within 0.3 days of yesterday's in at least 10 of 12 cells.
