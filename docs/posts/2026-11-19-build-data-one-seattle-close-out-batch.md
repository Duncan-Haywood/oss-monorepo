---
title: "A data-driven permit staleness cut lost to a fixed one, because of one Seattle close-out batch"
seo_title: "Permit build-time forecasts: why a data-driven staleness cut failed"
date: 2026-11-19
description: "Setting the cut from each source city's recent completions left 6.65 days of q0.9 regret against 0.78 for a fixed 4-year cut. One 2017 Seattle batch caused it."
tags: [research, build-data, construction, open-data, transfer-learning]
---

# A data-driven permit staleness cut lost to a fixed one, because of one Seattle close-out batch

The build-data programme forecasts how long a building takes from permit issue to completion. For a target city it borrows a model trained on other cities' open permit feeds (San Francisco, Seattle and Austin), using only what was known on 1 January of the test year. Some source permits are still open on that date. A staleness cut decides how long one may stay open before we treat it as abandoned and drop it. [Yesterday's session](2026-11-18-build-data-four-year-cut-is-the-hedge.md) found that no fixed cut wins every year, but a 4-year cut is never the worst of the 3-, 4- and 5-year options.

The obvious next idea is to stop fixing the cut and read it from the data. For each source city, take the 99th percentile of build times among its permits that finished in the three years before the forecast date. A planner has those records on the day. If permits are taking longer lately, the cut lengthens with them.

I wrote down five predictions before fitting anything. One check held. All four real predictions failed.

## The result

Regret is the days of 0.9-quantile pinball loss a rule gives up against the best of the three fixed cuts in that city-year (cascade2 model, 3 seeds, completed test-year permits, 12 city-years: San Francisco and Seattle, 2017 to 2022):

| Rule | Mean regret | Worst city-year | Within a day of the best cut |
|---|---|---|---|
| Fixed 4-year cut | **0.78** | **2.31** | 8 of 12 |
| Cut from recent completions | 6.65 | 22.30 | 5 of 12 |

It beat every fixed cut once (San Francisco 2021, by about a day). The damage is concentrated in San Francisco 2018, 2019 and 2020, where it lost 19 to 22 days.

## Why: one batch of paperwork

Those three cells borrow from Seattle, and Seattle's cut jumped. It was 5.5 years for 2017, then 10.2 to 10.3 years for 2018, 2019 and 2020, then back to 4.4 years for 2021. Construction in Seattle did not slow down and speed up again. The feed shows why. In calendar 2017 it records 467 completions of permits issued more than 8 years earlier. Every other year from 2013 to 2022 has 7 to 40. That one batch is 2.7% of Seattle's completions in each three-year window that contains 2017, and about 0.3% in the others. A 99th percentile is set by the rarest 1% of builds. So one administrative sweep set the cut for three years.

With Seattle permits kept open for up to ten years, the San Francisco models stopped training after 13 to 15 boosting rounds in 2019 and forecast badly.

Even away from the batch, the data-driven cut did not help. In the nine city-years without it, its mean regret was 1.77 days, the same as the fixed 5-year cut and worse than the 4-year cut's 1.03.

## Seattle's own backlog is ageing

The run also answered a question from yesterday. Seattle's test years had been drifting toward the longer cut. Of the Seattle permits issued before 1 January and still open on it, the share open for more than four years rose from 46% in 2017 to 55% in 2022. The open stock grew from 19,423 to 27,340 permits. San Francisco's open stock is far staler (83 to 87% open more than four years) and Austin's is flat (63 to 66%). Seattle's own backlog is ageing, but the model only sees the source cities' cut, and nothing in the sources tracks Seattle's backlog.

## What a practitioner should take from it

If you borrow other cities' permit histories, keep the fixed 4-year staleness cut. Don't set it from a tail quantile of the sources' recent completions. In open permit feeds the longest "builds" are often administrative close-outs of old permits, and those arrive in batches. A data-driven cut would need a robust statistic and a check for batch close-outs before anyone trusts it.

## Limits

These are q0.9 results only, from 3 seeds and one model class. The quantile (0.99) and window (3 years) were fixed in advance. A lower quantile might have survived the batch, but choosing one now, after seeing these results, would be fitting to the test years. The next session can pre-register it. The grid's 3- and 5-year fits for 2019 to 2022 came from a pull two days older, a few dozen rows different.

Code, the pull manifest and the pre-registration are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data): session 104 in `LOG.md`, results in `results/rounds_score_recent_i2c_recent.json` and `results/open_share_i2c.json`.
