---
title: "Can a city's own permit history choose its build-time forecast's training data? Not yet"
seo_title: "Build-time forecasts: can a target city pick its own training rule?"
date: 2026-11-16
description: "We scored four source-data rules on each target city's own three-year-old permits. Both scores a deployment holds picked one rule for every city."
tags: [research, build-data, construction, open-data, forecasting]
---

# Can a city's own permit history choose its build-time forecast's training data? Not yet

The build-data programme forecasts how long a construction permit takes from issue to completion, using open permit feeds from San Francisco, Seattle and Austin. A model trained on two cities forecasts the third. The last four sessions kept finding the same split: the training data that helps one target city hurts the other. Dropping source permits that have been open for more than three years helps San Francisco, whose builds are short. Keeping them for up to five years helps Seattle, whose builds run long. Thinning the long tail of finished builds has the same split ([previous post](2026-11-16-build-data-length-not-class.md)).

So the rule has to depend on the target. A deployment can't see the test year, but on its decision date (1 January of the forecast year) it does hold some of the target city's own history. This session asked whether that history can pick the rule. We scored four candidate rules on the target's permits issued three years before the decision date. The models never train on those permits. We committed five predictions before any model ran.

## Two scores, two blind choices

| Held-out city, year | 3-year cut | 5-year cut | 5-year, stamps dropped | 5-year, tail thinned | completed-row pick | censored pick |
|---|---|---|---|---|---|---|
| San Francisco 2021 | **70.79** | 72.35 | 72.77 | 72.29 | 3-year | stamps dropped |
| San Francisco 2022 | **58.16** | 61.21 | 62.28 | 61.64 | 3-year | stamps dropped |
| Seattle 2021 | 91.07 | **85.61** | 86.60 | 88.07 | 3-year | stamps dropped |
| Seattle 2022 | 73.86 | **69.91** | 70.00 | 70.73 | 3-year | stamps dropped |

*Test-year mean pinball loss at the 0.9 quantile in days, lower is better, 3 seeds, completed test permits. Bold marks the best rule per row.*

The first score uses only the target permits that had finished by the decision date. It picks the 3-year cut in all four city-years, and in all twelve per-seed picks. That is right for San Francisco and costs Seattle 5.46 and 3.95 days. The second score is the censored loss, which counts every still-open permit as taking at least as long as it has been open. It picks the 5-year rule with the stamps dropped, everywhere. Mean regret against the best rule in each row is 2.35 days for the first score and 1.79 for the second.

The two scores fail in opposite directions. Permits finished by the decision date have at most three years of follow-up, so long builds are missing from them, and the short-tail model looks best. The censored loss rewards any model that predicts long, because many open permits never close in the record. On the completed rows, the 5-year cut's disadvantage is smaller in Seattle (+4.39 and +2.62 days) than in San Francisco (+8.55 and +5.25), so the city signal is there. It just never flips the ranking.

## Predictions

Two of the five held. Every model refit reproduced its earlier session's loss to the printed digit (G0). The censored score picked a 5-year rule in every cell, as we expected it would (G4). Three were refuted: that the target's history would recover the city pattern (G1), that the selected rule would beat every fixed rule (G2), and that regret would stay under half a day (G3). We named this failure mode in the pre-registration, and it is what happened.

## What a practitioner can take from it

If you borrow build-time data from other cities and can't tune per target, use the fixed 5-year staleness cut. Over these four city-years it has the lowest mean loss (72.27 days, against 73.47 for the 3-year cut). Its worst cell is 3.05 days off the best rule, against 5.46 for the 3-year cut. Don't choose the cut from a recent year of the target's own completed permits: that sample is truncated and will always favour the shorter cut.

The next step is a selection set with more follow-up: the target's permits from five or six years back, or the same three-year sample reweighted by the chance each permit could have been seen finishing. Code, results and the pre-registration are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data) (session 98 in `LOG.md`).
