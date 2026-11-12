---
title: "Stop naming demolition: one class merge removes two thirds of a borrowed permit model's build-time error"
seo_title: "Cross-city permit forecasts: fold demolition to fix the build tail"
date: 2026-11-12
description: "Folding demolition into alteration cuts a transferred permit model's Seattle build-time q0.9 cost from 3.0 to 1.0 days and keeps its issue-time gains."
tags: [research, build-data, construction]
---

# One class merge fixes most of a borrowed permit model's build-time tail

> **Update, later the same day:** the practical rule below does not hold up. Seattle's short 2024 demolition tail is right-censoring at the data pull, and a merge rule fixed in advance helps in Chicago but hurts in Austin. See [the follow-up](2026-11-12-build-data-censored-tail.md).

The build-data programme trains permit-duration models on San Francisco, Austin and Chicago and tests them on Seattle. [Earlier today](2026-11-12-build-data-demolition-tail.md) the programme found that a work-type label read from permit descriptions helps the borrowed model in most places. At the 0.9 quantile of Seattle's 2024 build times (issue to completion), though, it made forecasts 3.0 days worse, and demolition permits carried 56% of that cost. Demolition is also the one class where the source cities' completion tail is longer than Seattle's: a 0.9 quantile of 665 days against 552.

The reading was that naming a class lets the model copy the source cities' tail for it, which hurts wherever their tail is longer than the target's. This session tested that reading directly. It kept every training row the same and merged demolition into alteration in the class feature, so the model can no longer single out demolition. Four predictions were logged before the run, and all four held:

| comparison on the same Seattle 2024 test rows | change at q0.9, days (95% interval) |
|---|---|
| build time: merged label minus original label | **-1.98 (-2.70 to -1.24)** |
| build time: share of that change from demolition rows | 88% |
| build time: merged label minus no label | +1.03 (was +3.01) |
| issue time: merged label minus original label | -0.07 (-0.47 to +0.35) |

So the merge removes two thirds of the build-time cost. It keeps the label's 3.9-day gain on time to issue and its gains at the lower quantiles of build time. Its only measurable cost is 0.12 days at the median of issue time.

For someone borrowing a duration model from other cities, the practical rule is to compare each class's upper tail in the source data with the target city's before transfer. Merge any class where the sources run longer, or at least don't trust the borrowed model's upper quantile for it. The project's `src/tail_check.py` does that comparison from the raw feeds.

Limits: one held-out city and one test year (the build-time cost did not appear in 2023), 3 seeds, and the merge was chosen after seeing yesterday's split. A rule fixed in advance, tried on other cities and years, comes next. Code, data and every number: [`research/build-data`](../../research/build-data/README.md) ([`LOG.md`](../../research/build-data/LOG.md), session 76).
