---
title: "A city's six-year-old permits pick the right forecasting rule; its three-year-old ones cannot"
seo_title: "Six-year-old permits pick a city's build-time forecasting rule"
date: 2026-11-17
description: "Scored on a city's own six-year-old permits, four borrowed build-time models gave the best pick in 4 of 4 city-years. Three-year-old permits misled Seattle."
tags: [research, build-data, construction, open-data, transfer-learning]
---

# A city's six-year-old permits pick the right forecasting rule; its three-year-old ones cannot

The build-data programme forecasts how long construction takes, from permit issue to completion. It does this for a city by borrowing a model trained on other cities' open permit feeds (San Francisco, Seattle, Austin), using only what was known on 1 January of the test year. Several sessions found that the best way to prepare the borrowed training data depends on the target city. Dropping source permits that have been open for more than three years helps San Francisco, where builds are shorter. Keeping them for five years helps Seattle, where builds run long. That only helps a deployment if the city can tell which rule suits it before it has its answer.

The [last post](2026-11-16-build-data-target-cannot-pick-its-rule.md) tried to choose using the target's own permits issued three years earlier, and failed. Those permits have at most three years of follow-up on the decision date, so the ones already complete are the short builds. Scored on them, the shorter-tail rule always looks better, Seattle included. This session scored the same four candidate rules on older cohorts of the target's own permits. We committed six predictions before any model ran.

## The result

The pre-registered selector scores each candidate model on the target city's permits issued six years before the decision date that were completed by it, and keeps the lowest 0.9-quantile loss. Mean 0.9-quantile loss on the test year, in days:

| | San Francisco 2021 | San Francisco 2022 | Seattle 2021 | Seattle 2022 | mean |
|---|---|---|---|---|---|
| 3-year cut | **70.79** | **58.16** | 91.07 | 73.86 | 73.47 |
| 5-year cut | 72.35 | 61.21 | **85.61** | **69.91** | 72.27 |
| picked from six-year-old permits | 3-year | 3-year | 5-year | 5-year | **71.12** |
| picked from three-year-old permits | 3-year | 3-year | 3-year | 3-year | 73.47 |

The six-year-old cohort picked the best of the four candidates in all four city-years, so it lost nothing to the best choice made in hindsight. It beat the best single fixed rule by 1.15 days. Each seed's pick also landed on the right side of the city split, 12 times out of 12. Every refit reproduced session 98's models exactly, so the gain comes from the selector, not from new models.

## Why the cohort's age matters

The two rules differ in how long a tail they predict. A score can only tell them apart on permits that have had time to show a long tail. In Seattle the 5-year rule's score advantage on the target cohort grows with the cohort's age:

| Seattle, 5-year minus 3-year score | 2021 | 2022 |
|---|---|---|
| three-year-old permits | +4.39 | +2.62 |
| three-year-old, IPCW-weighted | +3.16 | +1.03 |
| five-year-old permits | −0.45 | +2.07 |
| six-year-old permits | −0.82 | −0.92 |

A negative number means the score favours the 5-year rule, which is right for Seattle. Reweighting the three-year-old permits by the inverse chance of their being finished by the decision date (IPCW) narrows the gap but never crosses it. That was one of our predictions, and it was refuted. Weights can rescale the rows you have, but they cannot create the builds that run past three years. Five-year-old permits got three of four cells right.

## How far to trust it

Four cells is a small test: a coin would pick all four right one time in sixteen. The Seattle margins are under a day, on about 6,500 completed permits, and one fewer year of follow-up flips one of them. The six-year-old cohorts date from 2015 and 2016, before COVID, and faster change between cohort and test year could erase the signal. We did not save per-permit predictions, so there is no bootstrap of the pick yet. The next steps are that bootstrap, more cells (Austin held out, test years 2019 and 2020), and scoring a finer grid of cut-offs on the oldest cohorts.

If you borrow a model of build times from other cities, the practical point is this. To choose how to treat stale open permits in the source data, score the candidates on your own permits that are old enough to have finished their long builds, not on recent ones.

Code, results and the full log are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data) (`src/rounds.py`, `results/rounds_score_tfol_i2c_summary.json`, `LOG.md` session 99). This is research on public data, not advice for any particular project.
