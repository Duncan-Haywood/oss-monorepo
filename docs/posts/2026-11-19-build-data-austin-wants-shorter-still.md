---
title: "Austin's permit forecasts want an even shorter staleness cut: 1 year beats 2, 2 beats 3"
seo_title: "Permit build-time forecasts: Austin wants a shorter cut still"
date: 2026-11-19
description: "A 2-year staleness cut beat the 3-year cut in all six Austin years and lost in all 12 SF and Seattle ones; on the chooser's menu it cut regret to 1.38 days."
tags: [research, build-data, construction, open-data, transfer-learning]
---

# Austin's permit forecasts want an even shorter staleness cut: 1 year beats 2, 2 beats 3

The build-data programme forecasts how long a building takes, from permit issue to completion. For a target city it borrows a model trained on other cities' open permit feeds, using only what was known on 1 January of the test year. A staleness cut decides how long a source permit may stay open on that date before we treat it as abandoned and drop it.

[This morning's session](2026-11-19-build-data-austin-breaks-the-four-year-cut.md) found that Austin, whose builds are shorter than those of its sources (San Francisco and Seattle), wanted the 3-year cut in all six test years. The 3-year cut was the shortest one we had tried. So the next question was where the floor is. I wrote seven predictions and the scoring code before fitting anything, then fitted a 2-year cut for all 18 city-years and a 1-year cut for Austin. Three predictions held and four failed, the primary among them.

## Shorter keeps winning in Austin, and never elsewhere

Mean 0.9-quantile pinball loss on completed test permits, in days (cascade2 model, 3 seeds per cell):

| Target | 1-year cut | 2-year cut | 3-year cut | 4-year cut | 5-year cut |
|---|---|---|---|---|---|
| Austin, mean of 2017 to 2022 | **59.99** | 62.67 | 66.00 | 78.74 | 84.12 |
| San Francisco, mean of 2017 to 2022 | not fitted | 79.45 | 76.55 | 76.48 | 78.92 |
| Seattle, mean of 2017 to 2022 | not fitted | 89.90 | 86.16 | 84.33 | 83.66 |

In Austin the 2-year cut beats the 3-year cut in all six years, by 1.9 to 5.4 days. In San Francisco and Seattle it loses in all 12 city-years, by 0.5 to 7.4 days. Both results were predicted.

I predicted the 1-year cut would be too short for Austin. It was not: it beats the 2-year cut in five of six years. A 1-year cut is a degenerate rule here. The training years are four or more years and two years before the forecast date, so every source permit still open on that date is older than a year. At 1 year the model sees no open permits at all, only the sources' completed builds. For a short-build target that is the best rule we have tried. The seed spread is wide, though (−8.3 to +4.7 days per seed against the 2-year cut), so the order of the 1- and 2-year cuts is less settled than the order of the 2- and 3-year cuts.

## The chooser handles it

Since session 99 the programme has had a per-deployment chooser. It scores each candidate cut on the target's own permits issued six years before the forecast date and completed by it, then takes the lowest. My primary prediction was that adding the 2-year cut to its menu would make it worse, because that score leans toward short cuts. That prediction failed:

| Rule, over 18 city-years | Mean regret (days) | Worst city-year |
|---|---|---|
| Chooser over the 2-, 3-, 4- and 5-year cuts | **1.38** | 6.96 |
| Chooser over the 3-, 4- and 5-year cuts | 1.72 | 5.39 |
| Fixed 3-year cut (the best fixed cut) | 2.27 | 5.46 |
| Fixed 2-year cut | 3.37 | 11.83 |
| Fixed 4-year cut | 5.88 | 20.34 |

Regret is the loss above the best of the four cuts in that city-year. The chooser picks the 2-year cut in all six Austin years, and it is right each time. Outside Austin it picks the 2-year cut only in San Francisco 2017 to 2020, where its lean toward short cuts costs 0.7 to 7.0 days. In San Francisco 2021 and 2022 and in all six Seattle years it leaves the 2-year cut alone.

The same score ranks the 1-year cut first in every Austin year, so a chooser with it on the menu would be right five times out of six there. Whether it would also pick it in San Francisco and Seattle, where it would almost surely be wrong, needs the 1-year cut fitted for those 12 city-years. That is the next pre-registered step.

## What a practitioner should take from it

If you borrow other cities' permit histories to forecast build times, the right staleness cut depends on the target, not on the sources. Score the 2- to 5-year cuts on the target's own six-year-old permits and take the lowest. Pooled over 18 city-years, that beats every fixed cut. If the target's builds are clearly shorter than the sources', try dropping every open source permit and training on completed builds only. Be aware that the chooser's worst city-year (6.96 days) is worse than the fixed 3-year cut's (5.46 days), so you trade a worse worst case for a better average.

## Limits

There is one short-build target, 3 seeds, and q0.9 only. The 3- to 5-year cells come from pulls up to four days older; the feeds have grown since. Because of that, one check failed: the 2-year cut reproduced an older sweep only to within 0.22 days, not the 0.1 I had set. Regrets here are measured against four cuts, so they don't compare directly with this morning's three-cut figures.

Code, the pre-registration and the results are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data): session 107 in `LOG.md`, results in `results/rounds_score_floor_i2c_floor.json`, scorer `src/tfol_boot.py --floor`.
