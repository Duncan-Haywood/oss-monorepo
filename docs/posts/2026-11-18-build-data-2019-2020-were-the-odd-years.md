---
title: "Two more test years rescue a permit-forecast selector: 2019 and 2020 were the odd ones out"
seo_title: "Permit build-time forecasts: 2019 and 2020 were the odd years"
date: 2026-11-18
description: "On 2017 and 2018 the 3-year staleness cut wins again and the six-year-old-permit selector picks it. Pooled over 12 city-years it beats every fixed rule."
tags: [research, build-data, construction, open-data, transfer-learning]
---

# Two more test years rescue a permit-forecast selector: 2019 and 2020 were the odd ones out

The build-data programme forecasts how long a building takes from permit issue to completion. For each target city it borrows a model trained on other cities' open permit feeds (San Francisco, Seattle, Austin), using only what was known on 1 January of the test year. One choice in preparing the borrowed data matters a lot: how long a source permit may stay open before we treat it as abandoned and drop it. The two main candidates were a 3-year cut and a 5-year cut.

Two days ago the programme seemed to have a way to choose: score each candidate on the target city's own permits issued six years earlier that were finished by the decision date. On 2021 and 2022 that selector picked the best rule in all four city-years. Then it [failed on 2019 and 2020](2026-11-17-build-data-six-year-selector-does-not-replicate.md). The 5-year cut won in both cities, and the selector still picked the 3-year cut. A [bootstrap](2026-11-17-build-data-stable-and-wrong-bootstrap.md) showed the miss was stable, not noise.

So which pair of years is the unusual one? This session refit the models on test years 2017 and 2018, which no rule or selector had been tuned on. It also tried 4-year and 6-year cuts. Six predictions were committed before any model ran, and four of them failed.

## The result

Mean 0.9-quantile pinball loss on completed test-year permits, in days (3 seeds each; lower is better):

| cut | SF 2017 | SF 2018 | Seattle 2017 | Seattle 2018 | mean |
|---|---|---|---|---|---|
| 3 years | **81.80** | 86.19 | 80.34 | 89.68 | 84.50 |
| 4 years | 83.17 | **85.46** | **79.91** | **88.48** | **84.25** |
| 5 years | 90.66 | 89.13 | 81.73 | 88.60 | 87.53 |
| 6 years | 102.90 | 97.67 | 86.94 | 92.58 | 95.02 |
| six-year-old-permit pick | 3 years | 3 years | 3 years | 3 years | 84.50 |

We predicted 2017 and 2018 would look like 2019 and 2020, with the 5-year cut winning. They did not. In San Francisco the 3-year cut beats the 5-year cut by 8.86 and 2.94 days, and the 95% intervals from resampling permits are far above zero. Seattle 2017 goes the same way, by 1.39 days. Only Seattle 2018 prefers a 5-year rule, by about a day. The selector picked the 3-year cut in all four cells and every seed. That left 0.29 days of regret, against 3.32 for always using the 5-year cut.

## Twelve city-years together

Combined with session 101's refits, there are now twelve San Francisco and Seattle city-years from 2017 to 2022. Each has the same four candidate rules. This pooled view was not pre-registered, so read it as a description:

| | mean regret (days) | best rule picked |
|---|---|---|
| six-year-old-permit selector | **0.81** | 7 of 12 |
| fixed 5-year cut | 1.53 | |
| fixed 3-year cut | 1.60 | |
| 5-year cut, minus Austin's expiry stamps | 1.97 | |

All of the selector's large misses fall in 2019 and 2020, plus a small one in Seattle 2018. In San Francisco the 3-year cut wins in four of six years. The previous two posts treated 2019 and 2020 as the honest out-of-sample test. With more years in hand, those two years look like the exception. The selector is the best of the options we have, but only by about 0.7 days, and its misses cluster in adjacent years. It is a reasonable default, not a solved problem.

## The 5-year cut is not a plateau

The finer grid gave a clearer answer than we expected. Across these four cells, moving the cut from 5 to 4 years saves 3.3 days, and moving it to 6 years costs 7.5 days. The 4-year cut has the lowest loss of the four cuts in three of the four cells. How long a stale permit may stay in the training data is a parameter with a sharp optimum, not a detail.

## Limits

These are 0.9-quantile losses only, with three seeds per fit. The bootstrap treats permits as independent, so its intervals are too narrow when permits cluster by week or project. The 4- and 6-year cuts were fit only for 2017 and 2018. For 2017, the sources' training years reach back into the 2008 to 2012 construction slump.

## What's next

- Fit the 4-year cut on 2019 to 2022.
- Let the six-year-old-permit score choose among 3, 4 and 5 years.
- Find out what made 2019 and 2020 different.

Code, data pulls and the pre-registration are in [`research/build-data`](../../research/build-data/); the session's numbers are in `results/rounds_score_early_i2c_boot.json`, and the full log is [LOG.md](../../research/build-data/LOG.md), session 102.

*AI-assisted research on public open-data feeds; not engineering, legal or financial advice.*
