---
title: "A thin-class rule wins back most of Austin's build-time tail, and moves the cost to the median"
seo_title: "Permit duration transfer: a minimum-support rule for rare classes"
date: 2026-11-13
description: "Folding classes with under 1,000 source rows cut Austin's borrowed q0.9 build-time loss by 4.6 to 9.3 days in 2021-22 but cost 4.4 to 8.5 at the median."
tags: [research, build-data, construction, transfer-learning, evaluation]
---

# A thin-class rule wins back most of Austin's build-time tail, and moves the cost to the median

The build-data programme forecasts how long building permits take, here from issue to completion, with a model trained in other cities. [Yesterday we found](2026-11-12-build-data-which-classes-the-sources-fill.md) that a work-type class costs Austin 10 to 17 days of 0.9-quantile pinball loss. The cause was that 76% of Austin's permits are electrical, mechanical or plumbing jobs, and the source cities (San Francisco and Seattle) hold only 42 to 466 rows in each of those classes, all slow Seattle permits.

The obvious fix is a minimum-support rule: if a class has fewer than k rows in the source cities' training data, fold it into "other" before training. The rule reads only the sources, never the city it will be used in. We picked k on the 2020 test year from 100, 1,000 and 10,000 and then fixed it. We logged five predictions before running 2021 and 2022 with Austin, San Francisco and Seattle each held out in turn. All permits are scored, on cohorts old enough that their long builds have finished.

Days of mean pinball loss against the unfolded work-type class, with 95% week-block intervals. Negative means the rule helps.

| held-out city, year | classes folded | q0.9 | q0.5 |
|---|---|---|---|
| Austin 2021 | electrical, mechanical, plumbing, fire | **-9.3 (-10.0 to -8.6)** | **+8.5 (7.7 to 9.3)** |
| Austin 2022 | the same | **-4.6 (-5.9 to -3.0)** | **+4.4 (3.3 to 5.6)** |
| San Francisco 2021 | sign, fire | -0.2 (-0.4 to 0.0) | -0.1 (-0.2 to -0.1) |
| San Francisco 2022 | sign, fire | -0.3 (-0.4 to -0.1) | -0.2 (-0.3 to -0.1) |
| Seattle 2021 and 2022 | fire (3 source rows) | 0.0 | 0.0 to +0.2 |

What held and what didn't:

- **The threshold carries across years.** k = 1,000 won on 2020, and in 2021 and 2022 it still removes 61% and 47% of Austin's tail cost. We had predicted at least half in both years, so 2022 misses by three points.
- **It costs nothing where classes are well supported.** San Francisco keeps its whole 16 to 23-day gain from the work-type class, and Seattle's results don't move.
- **The cost doesn't disappear. It moves.** Austin's median forecast gets 4 to 9 days worse, which leaves it worse than the plain permit-type class we started from. None of the five predictions covered this.

Our reading of the median cost: folding a thin class into "other" doesn't make it go away. Under permit type alone, Austin's trade permits are a category the source cities never had, and the boosted trees send them down the "not this category" side of each split. Under the rule they join the sources' catch-all rows and take on those rows' durations. So the fold target matters as much as the threshold.

For anyone borrowing a duration model across cities: count how many source rows sit behind each class your target city uses most, before you train. A rare class in the sources is a risk whatever you do with it. Folding it into a catch-all trades a tail error for a median one. The next session tests folding thin classes to "unseen" instead of "other".

Code, results and the full log: [`research/build-data`](../../research/build-data/README.md), session 81 in [`LOG.md`](../../research/build-data/LOG.md).
