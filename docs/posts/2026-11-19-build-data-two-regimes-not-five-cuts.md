---
title: "Permit build-time forecasts: five staleness cuts turn out to be two regimes"
date: 2026-11-19
description: "A 1-year staleness cut is barely worse than 2 years for SF and Seattle; on the chooser's menu it cuts pooled regret over 18 city-years from 2.38 to 1.62 days."
tags: [research, build-data, construction, open-data, transfer-learning]
---

# Permit build-time forecasts: five staleness cuts turn out to be two regimes

The build-data programme forecasts how long a building takes, from permit issue to completion. For a target city it borrows a model trained on other cities' open permit feeds, using only what was known on 1 January of the test year. A staleness cut decides how long a source permit may stay open on that date before we drop it as abandoned.

[The last session](2026-11-19-build-data-austin-wants-shorter-still.md) found that Austin, whose builds are shorter than its sources', does best with a 1-year cut. At 1 year every source permit still open on the forecast date is older than the cut, so the model trains on the sources' completed builds only. We had not fitted that cut for San Francisco or Seattle, so we could not say what it does to a chooser that has it on the menu. This session fitted those 12 city-years. I wrote seven predictions and the scoring code first ([pre-registration](../../research/build-data/LOG.md)). Four held, the primary among them, and three failed.

## Outside Austin, 1 year and 2 years are nearly the same rule

Mean 0.9-quantile pinball loss on completed test permits, in days (cascade2 model, 3 seeds per cell, test years 2017 to 2022):

| Target | 1-year cut | 2-year cut | 3-year cut | 4-year cut | 5-year cut |
|---|---|---|---|---|---|
| Austin | **59.99** | 62.67 | 66.00 | 78.74 | 84.12 |
| San Francisco | 79.54 | 79.45 | 76.55 | 76.48 | 78.92 |
| Seattle | 91.09 | 89.90 | 86.16 | 84.33 | 83.66 |

I predicted that each year of staleness taken away would cost more than the last. It does not. In SF and Seattle the 1-year cut is on average only 0.65 days worse than the 2-year cut, and it is better in 3 of 12 city-years. The step from 3 years to 2 costs 3.32 days. So the five cuts are really two regimes: completed source builds only (1 or 2 years), and an allowance of 3 to 5 years for permits still open. Austin wants the first regime. SF and Seattle want the second, and the 1-year cut is never the best cut for either of them.

## The chooser keeps its gains, and its lean

The chooser scores each cut on the target city's own permits issued six years before the forecast date and completed by it, and takes the lowest. Regret is the gap to the best of the five cuts in hindsight, averaged over 18 city-years:

| Rule | Mean regret (days) | Worst city-year |
|---|---|---|
| Chooser over 1 to 5 years | **1.62** | **6.03** |
| Chooser over 2 to 5 years | 2.38 | 7.33 |
| Fixed 3-year cut, the best fixed cut | 3.27 | 10.76 |
| Fixed 1-year cut | 3.91 | 14.44 |

The chooser takes the 1-year cut in all six Austin years and is right in five. That gain was already fixed by the last session's numbers, which I said up front. The new part is SF and Seattle. There the chooser takes the 1-year cut in five SF years (2017 to 2021), because the six-year-old permits it scores on are themselves skewed toward short builds. That costs 0.21 days per SF or Seattle city-year against the 2- to 5-year chooser. Pooled, it is still the best rule tested so far, on the mean and on the worst city-year.

## What a planning team can take from this

If you borrow other cities' permit records to forecast build times, one question matters more than the exact cut: should the model see the sources' still-open permits at all? For a city whose builds are shorter than its sources', no. For one whose builds are as long or longer, yes, with a 3- to 5-year allowance. Scoring both regimes on your own six-year-old permits gets that choice right for all six Austin years, but it still picks wrongly in most SF years.

Limits: Austin is the only short-build target, so the case for the first regime rests on one city. Each figure is the mean of 3 seeds, and only the 0.9 quantile was scored. The next step is a guard against the short lean, fixed before scoring: keep the completed-only regime only when it wins the six-year-old check by more than the seed spread.

Code, data pull and every number: [`research/build-data`](../../research/build-data/README.md).
