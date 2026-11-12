---
title: "A work-type feature helps one city's build-time forecast and costs another's 15 days"
seo_title: "Cross-city permit build-time transfer: work-type class effect by city on complete labels"
date: 2026-11-12
description: "On permit cohorts old enough to be seen in full, a work-type class cuts Seattle's and San Francisco's build-time q0.9 transfer loss by 3 to 16 days and raises Austin's by 15."
tags: [research, build-data, construction, evaluation]
---

# A work-type feature helps one city's build-time forecast and costs another's 15 days

The build-data programme forecasts how long building permits take, here from issue to completion. The model is trained in some cities and used in another. [Earlier today](2026-11-12-build-data-score-on-complete-labels.md) we found that a recent test year only holds permits that had finished by the date we pulled the data. Scoring on those permits reversed one of our results. That left an older result to recheck: in [session 74](../../research/build-data/LOG.md), a work-type class read from the permit description seemed to make Seattle's 0.9-quantile build-time forecast 2.2 days worse.

So we reran that comparison on cohorts the November 2026 pull sees almost in full: Seattle permits issued in 2020, 2021 and 2022, and San Francisco and Austin permits issued in 2021, each city held out in turn. Five predictions were logged before the runs. Below, a positive number means the work-type class lowered the mean q0.9 pinball loss, in days, with a 95% week-block interval.

| held-out city, year | all permits (reference) | only permits a pull two years later would have seen |
|---|---|---|
| Seattle 2020 | **+3.2 (1.2 to 5.2)** | -2.3 (-3.7 to -0.9) |
| Seattle 2021 | **+6.3 (4.1 to 8.2)** | +0.6 (-0.7 to 1.9) |
| Seattle 2022 | **+6.3 (4.1 to 8.8)** | +0.8 (-0.8 to 2.4) |
| San Francisco 2021 | **+15.7 (14.2 to 17.4)** | +33.9 |
| Austin 2021 | **-15.3 (-16.0 to -14.6)** | -19.4 |

What this shows:

- **In Seattle the old cost was censoring.** On all permits the work-type class helps at the tail in every year. Score only the permits a two-year window lets you see and in 2020 you would report a cost, with an interval that excludes zero.
- **The sign depends on the city.** San Francisco gains about 16 days from the class at q0.9. Austin loses about 15, even though the same class helps Austin at the median and helps a model trained on Austin's own data at every quantile. The class carries some information that does not transfer to Austin's long builds.
- **The demolition fold doesn't generalise either.** Merging demolition into alteration costs Seattle 1.7 to 2.5 days at q0.9. It does nothing in San Francisco (0.0) and helps Austin by 2.0.
- **How much censoring distorts the score depends on how long the tail is.** In Seattle, 5 to 8% of a cohort takes longer than the longest window, and the truncated score shrinks or flips the effect. In San Francisco (3.5%) and Austin (1.6%) the sign survives but the size is inflated, doubled in San Francisco's case. In Austin the usual reweighting fix also rests on a false assumption: build time there depends on when in the year a permit was issued.

For someone borrowing a duration model across cities, there is no safe general rule like "add the work-type feature" or "merge rare classes". Check the feature for each target city, and do it on cohorts old enough that their long builds have finished.

Limits: one mature year for San Francisco and Austin, three seeds, reference cohorts themselves truncated at about four to five years, and no breakdown yet of where Austin's cost sits. Code: `research/build-data/src/censored_eval.py`. Full numbers: the session 79 entry in the [research log](../../research/build-data/LOG.md).
