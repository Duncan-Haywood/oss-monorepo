---
title: "Out of sample, the six-year-old-permit selector picks the wrong forecasting rule in 4 of 4 city-years"
seo_title: "A build-time rule selector that failed out of sample"
date: 2026-11-17
description: "A selector that chose the best build-time rule in 4 of 4 city-years chose wrong in 4 of 4 new ones. A bootstrap shows it is biased, not noisy."
tags: [research, build-data, construction, open-data, replication]
---

# Out of sample, the six-year-old-permit selector picks the wrong forecasting rule in 4 of 4 city-years

The [previous post](2026-11-17-build-data-six-year-old-permits-pick-the-rule.md) reported a promising result. To forecast build times in a city, the build-data programme borrows a model trained on other cities' open permit feeds. One choice in that model is how long a source permit can stay open before it is treated as abandoned and dropped: 3 years or 5. The earlier runs found that the 3-year cut suited San Francisco and the 5-year cut suited Seattle. Session 99 proposed choosing between them using the target city's own permits issued six years before the decision date. That rule picked the best option in all four city-years tested. That post also named its own weakness: four cells, all from the test years the candidate rules had been tuned on, and a coin gets four of four right one time in sixteen.

This session ran the check it called for. We wrote down six predictions before any model ran, then repeated the whole procedure on test years 2019 and 2020. None of the four rules, and not the selector either, had been chosen on those years. We also refit 2021 and 2022 and saved every permit's prediction, so a bootstrap could show how often the pick would flip on resampled permits.

## The result

Mean 0.9-quantile pinball loss on the test year, in days (lower is better; the best rule in each column is in bold):

| | SF 2019 | SF 2020 | Seattle 2019 | Seattle 2020 | mean |
|---|---|---|---|---|---|
| 3-year cut | 83.31 | 79.05 | 82.25 | 99.75 | 86.09 |
| 5-year cut | 82.17 | **77.97** | **80.79** | **95.31** | **84.06** |
| 5-year cut, length-thinned tail | **81.68** | 78.22 | 81.17 | 96.32 | 84.35 |
| picked from six-year-old permits | 3-year | 3-year | 3-year | 3-year | 86.09 |

A 5-year rule wins in all four new city-years, San Francisco included. Its margin over the 3-year cut is 1.1 to 4.4 days, and every 95% bootstrap interval of that margin lies below zero. The selector picked the 3-year cut every time, the worst fixed rule on these years, with a mean regret of 2.15 days. Four of the six predictions failed. The two that held were the reproduction check (every 2021 and 2022 refit matched session 99 to the printed digit) and the stability check below.

## Biased, not noisy

The obvious reading of a failure like this is noise: the Seattle margins in session 99 were under a day. The bootstrap rules that out. In all eight city-years, at least 96% of 2,000 resamples of the target's permits keep the selector's pick on the same side. In seven of the eight, the interval of its score difference excludes zero. The score is stable, and in the new years it points the wrong way. Six-year-old permits that have completed still favour the shorter tail, as three-year-old ones did in [session 98](2026-11-16-build-data-target-cannot-pick-its-rule.md). The sign of the selector's score matches the sign of the test-year result in exactly four of eight cells, the four it was found on.

The rest of the failure comes from the premise. "Three years for San Francisco, five for Seattle" holds only in 2021 and 2022. In 2019 and 2020 both cities want the longer cut, so the city-specific choice the selector was built to make mostly does not exist.

## What a deployment should do

Over all eight city-years, the mean 0.9-quantile loss is:

- fixed 5-year cut: 78.16 days
- the selector: 78.61 days
- fixed 3-year cut: 79.78 days
- the best rule chosen in hindsight for each city-year: 77.53 days

So the default goes back to a fixed cut of about five years. The programme's paper now says so, in place of session 99's selector. Next we will check whether 5 years is a plateau or a sharp optimum by testing 4-year and 6-year cuts, and add Austin as a third target city.

The limits: this covers the 0.9 quantile only, with three seeds and two target cities. The bootstrap resamples permits independently, so its intervals are narrower than a block bootstrap's would be. 2020 is a COVID year.

Code, results and the full pre-registered log are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data) (`src/tfol_boot.py`, `results/rounds_score_oos_i2c_boot.json`, `LOG.md` session 100). This is research on public data, not advice for any particular project.
