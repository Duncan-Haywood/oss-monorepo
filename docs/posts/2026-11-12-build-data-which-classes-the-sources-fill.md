---
title: "Austin's 15-day build-time penalty came from 649 Seattle permits"
seo_title: "Permit duration transfer: why work type helps SF and hurts Austin"
date: 2026-11-12
description: "Across three test years, a work-type class helps San Francisco's borrowed build-time forecast by 14 to 23 days at q0.9 and costs Austin 10 to 17. The cause is which classes the source cities fill, and with how many rows."
tags: [research, build-data, construction, transfer-learning, evaluation]
---

# Austin's 15-day build-time penalty came from 649 Seattle permits

The build-data programme forecasts how long the work behind a building permit takes, from issue to completion. The model is trained in some cities and applied to another. [Earlier today](2026-11-12-build-data-work-type-tail-by-city.md) we found that a work-type class, read from permit descriptions, helps San Francisco's borrowed forecast at the 0.9 quantile by about 16 days and costs Austin about 15. Both results came from a single test year. This run asked whether they hold in other years, and why the sign flips.

Predictions were logged before the runs. Scoring uses permit cohorts the November 2026 data pull sees almost in full, issued in 2020, 2021 and 2022. A positive number means the work-type class lowers mean q0.9 pinball loss, in days, with a 95% week-block interval.

| held-out city | 2020 | 2021 | 2022 |
|---|---|---|---|
| San Francisco | **+14.4** (12.1 to 16.7) | **+15.7** (14.2 to 17.4) | **+22.7** (21.1 to 24.1) |
| Austin | **−17.2** (−18.2 to −16.1) | **−15.3** (−16.0 to −14.6) | **−9.8** (−11.7 to −7.7) |

So the city split is stable. Why it happens is the more useful finding.

**Where Austin's cost sits.** We expected it in the building classes that the work-type cascade creates (new construction, alteration, demolition). It doesn't. In every year, 77 to 86% of the cost sits in Austin's electrical, plumbing and mechanical permits. Those permits have the same class label in both versions of the model.

**Why.** If the class is permit type alone, the source cities (San Francisco and Seattle) have *no* electrical, mechanical or plumbing rows, so the transfer model sees Austin's trade permits as an unknown category. The work-type rules move 466, 141 and 42 Seattle permits into those classes. That is 649 of 704,078 source rows. Their 0.9-quantile build times are 720 to 977 days, against Austin's own 357 to 469. Trade permits are 76% of Austin's test year, so those few slow Seattle rows end up setting the forecast tail for most of Austin.

**San Francisco is the mirror case.** 98% of its permits are alterations. With permit type alone the sources have no alteration class either; everything sits in "other". The work-type rules fill alteration with 271,672 Austin and Seattle rows, whose tail (482 days) is closer to San Francisco's (646). Many rows with similar durations help. A few rows with longer durations hurt.

For anyone moving a duration model between cities: look at how many source rows sit behind each of the target city's main classes, and whether their durations look alike, before you add a class feature. You can check both from training data before deploying anything.

Two smaller results. Folding demolition into alteration helped Austin in 2021 but costs it 1.8 days in 2020, so that advice is withdrawn for Austin. Scoring only the permits a two-year-later pull would have seen keeps every sign here but overstates the size by 1.2 to 2.4 times.

Next: a minimum-support rule fixed in advance (a class with too few source rows falls back to "other"), predicted to remove most of Austin's cost and keep San Francisco's gain.

Limits: three seeds; reference cohorts truncated at about four to six years; the per-class split is descriptive, with no intervals; the source-row diagnostic was run for 2021. Code: `research/build-data/src/censored_eval.py` and `src/class_shift.py`. Full numbers are in the session 80 entry of the [research log](../../research/build-data/LOG.md).
