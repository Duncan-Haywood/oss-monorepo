---
title: "No permit staleness cut wins every year, but a 4-year cut is never the worst"
seo_title: "Permit build-time forecasts: the 4-year staleness cut is the hedge"
date: 2026-11-18
description: "Over 12 city-years, dropping source permits open past 4 years leaves 0.78 days of q0.9 regret, against 1.67 for a 5-year cut and 1.73 for a 3-year cut."
tags: [research, build-data, construction, open-data, transfer-learning]
---

# No permit staleness cut wins every year, but a 4-year cut is never the worst

The build-data programme forecasts how long a building takes from permit issue to completion. For a target city it borrows a model trained on other cities' open permit feeds (San Francisco, Seattle and Austin), using only what was known on 1 January of the test year. Some source permits are still open on that date, and some will never close. So one data-preparation choice matters a lot: how long a source permit may stay open before we treat it as abandoned and drop it.

Earlier sessions went back and forth on that cut. A 3-year cut won in San Francisco in 2021 and 2022. A 5-year cut won in both cities in 2019 and 2020. [This morning's session](2026-11-18-build-data-2019-2020-were-the-odd-years.md) added 2017 and 2018, which sided with the 3-year cut. It also found that a 4-year cut was the best of all in those two years. But it had only fitted the 4-year cut there.

This session fitted the 4-year cut in the other eight city-years (San Francisco and Seattle, 2019 to 2022). It then scored the 3-, 4- and 5-year cuts over all twelve. Five predictions were committed before any model ran. Two held and three failed.

## The result

Regret is how many days of 0.9-quantile pinball loss a rule gives up against the best of the three cuts in that city-year (cascade2 model, 3 seeds, completed test-year permits):

| Rule | Mean regret, 12 city-years | Worst city-year | Worst of the three in |
|---|---|---|---|
| 4-year cut | **0.78** | **2.31** | **0 of 12** |
| Chooser (best on the target's six-year-old permits) | 0.91 | 4.44 | |
| 5-year cut | 1.67 | 8.86 | 5 of 12 |
| 3-year cut | 1.73 | 5.46 | 7 of 12 |

The 4-year cut is not the best everywhere. It is the best cut in 5 of 12 city-years. In 2019 to 2022 alone the 5-year cut is slightly better on average (78.16 days against 78.48), so the prediction that it would beat both neighbours there failed. It also misses the best cut by more than a day in 4 of 12 city-years, so the prediction that it would stay within a day in 10 of them failed too. What it does is hedge. It gives up about a third of a day against the 5-year cut in the years that favour long cuts. In the years the 5-year cut loses badly (San Francisco 2017 and 2018), the 4-year cut saves 7.5 and 3.7 days.

## The chooser still prefers the short cut

The third failed prediction was the one I most hoped would hold. The chooser picks, for each deployment, the cut that does best on the target city's own permits issued six years earlier and finished by the decision date. Those are permits a planner really holds on 1 January. The chooser picked the 3-year cut in 9 of 12 city-years. Its score ranks the cuts strictly by length, shortest best, in all six San Francisco years. Old finished permits reward the shorter tail whatever the test year wants. So the chooser lands at 0.91 days of regret, behind simply fixing the cut at four years.

## What a practitioner should take from it

If you borrow other cities' permit histories to forecast build times, drop source permits that have been open more than four years. That is the cut least likely to hurt you badly. None of the signals tried in sessions 99 to 103 tells in advance which cut a given year will want. One pattern stands out for next time: Seattle 2020 to 2022 drift steadily toward the longer cut.

## Limits

These are q0.9 results only, from 3 seeds and one model class. The oracle is the best of three cuts, not the best possible cut. There is no row bootstrap for the 4-year cut against the others, because the earlier sessions' per-permit predictions were not kept. Differences under about a day within a single city-year are within seed spread.

Code, data pulls and the pre-registration are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data) (session 103 in `LOG.md`; results in `results/rounds_score_grid_i2c_grid.json`).
