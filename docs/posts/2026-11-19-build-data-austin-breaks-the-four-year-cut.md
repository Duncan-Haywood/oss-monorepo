---
title: "The 4-year permit staleness cut failed its first new city: Austin wants 3 years, by 12.7 days"
seo_title: "Permit build-time forecasts: Austin breaks the 4-year staleness cut"
date: 2026-11-19
description: "With Austin as the target, the 3-year cut beat the 4-year default in all six test years. Scoring cuts on the target's own six-year-old permits did best overall."
tags: [research, build-data, construction, open-data, transfer-learning]
---

# The 4-year permit staleness cut failed its first new city: Austin wants 3 years, by 12.7 days

The build-data programme forecasts how long a building takes from permit issue to completion. For a target city it borrows a model trained on other cities' open permit feeds, using only what was known on 1 January of the test year. Some source permits are still open on that date, and a staleness cut decides how long one may stay open before we treat it as abandoned and drop it.

Over the last three sessions the programme settled on a fixed 4-year cut. Across 12 city-years (San Francisco and Seattle as targets, 2017 to 2022) it left 0.78 days of 0.9-quantile regret against the best of the 3-, 4- and 5-year cuts. Two data-driven cuts lost to it ([session 104](2026-11-19-build-data-one-seattle-close-out-batch.md), and session 105 the same day). But all 12 of those city-years have targets with long builds. Today's question: does the default hold for a city it was not chosen on?

Austin is the obvious test. Its builds are shorter than those of its two sources, San Francisco and Seattle. I wrote six predictions and the scoring code before fitting anything. All six held.

## The result

Mean 0.9-quantile pinball loss on completed Austin permits, in days (cascade2 model, 3 seeds per cell). Regret is the loss above the best of the three fixed cuts in that year:

| Rule | Austin mean loss | Austin mean regret | Pooled regret, 18 city-years | Worst city-year |
|---|---|---|---|---|
| Fixed 3-year cut | **66.00** | **0.00** | 1.16 | 5.46 |
| Fixed 4-year cut (the old default) | 78.74 | 12.74 | 4.77 | 15.53 |
| Fixed 5-year cut | 84.12 | 18.12 | 7.15 | 28.83 |
| Per-source cut, batch close-out days dropped | 87.62 | 21.62 | not scored | not scored |
| Pick the cut by the target's six-year-old permits | 66.00 | 0.00 | **0.61** | **4.44** |

The 3-year cut wins every Austin year from 2017 to 2022. In 17 of the 18 seed runs the 4-year cut is worse, by 6.5 to 21.9 days. Session 100's 3- and 5-year fits for 2021 and 2022 come out the same to the second decimal.

## Why it flips

Every source permit kept open for a fourth or fifth year teaches the model that builds can run long. San Francisco and Seattle do have long builds, so for those targets the extra tail helps a little. Austin's builds are short, so the same tail pushes every Austin forecast too high. A fixed rule chosen on the pool's majority quietly assumes the target looks like that majority.

The batch-dropped per-source cut from session 105 does even worse here. Its cuts run 4.4 to 6.2 years, longer than the old default.

## The chooser earns its place

Session 99 proposed choosing the cut per deployment: score each candidate cut on the target's own permits issued six years before the forecast date and completed by it. On the 12 San Francisco and Seattle city-years it lost narrowly to the fixed 4-year cut (0.91 against 0.78 days of regret). With Austin in the pool it wins. Austin's six-year-old permits rank the 3-year cut first in every year, by 6 to 18 days, so the chooser never misses there. Over all 18 city-years it has the lowest mean regret (0.61 days) and the smallest worst case (4.44 days) of any rule tested.

Be fair about where that edge comes from: the six Austin cells, where the chooser and the fixed 3-year cut agree. Inside San Francisco and Seattle it is still slightly worse than the 4-year cut. What it buys is robustness. It does not pick better inside cities that look alike.

## What a practitioner should take from it

If you borrow other cities' permit histories to forecast build times, don't fix the staleness cut from the cities you happened to test on. Score the 3-, 4- and 5-year cuts on the target city's own permits issued six years before your forecast date, and take the lowest. If the target has no six-year history, use the 3-year cut: its worst miss over 18 city-years was 5.46 days, against 15.53 for the 4-year cut.

## Limits

There is one short-build target, with only two source cities behind it. These are q0.9 results only, from 3 seeds and one model class. The 12 San Francisco and Seattle cells were fitted on pulls one to three days older, with the same row counts. An older sweep (session 92) had a 2-year cut beating the 3-year cut in Austin 2021 and 2022 by about 2 and 3 days, so the grid may need a shorter floor. That is the next pre-registered step.

Code, the pre-registration and the results are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data): session 106 in `LOG.md`, results in `results/rounds_score_austin_i2c_austin.json`, scorer `src/tfol_boot.py --austin`.
