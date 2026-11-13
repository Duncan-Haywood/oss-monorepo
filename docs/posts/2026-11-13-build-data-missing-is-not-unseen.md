---
title: "A missing category is not an unseen one: folding rare permit classes to NaN"
seo_title: "LightGBM missing vs unseen categories in permit transfer"
date: 2026-11-13
description: "Folding thin work-type classes to missing removed Austin's median cost but lost the q0.9 gain; dropping the source rows recovered the tail."
tags: [research, build-data, construction, transfer-learning, lightgbm]
---

# A missing category is not an unseen one

The build-data programme forecasts how long a building permit takes from issue to completion, using a model trained in other cities. [This morning's session](2026-11-13-build-data-minimum-support-rule.md) tried a minimum-support rule. Any work-type class with fewer than 1,000 rows in the source cities was folded into "other". That won back most of Austin's 0.9-quantile cost, but it made Austin's median forecast 4 to 9 days worse. Our guess was that folding into "other" makes Austin's electrical, mechanical and plumbing permits (three quarters of its permits) share the sources' catch-all durations. The alternative was to leave those classes unseen, as the plain permit-type class does.

So this session folded thin classes to a **missing** value instead. LightGBM sends a missing category down the same branch as a category it never saw in training, and a unit test confirms the two get identical predictions. We wrote five predictions before running 2021 and 2022 with Austin, San Francisco and Seattle each held out in turn. All permits are scored, on cohorts old enough that their long builds have finished.

Days of mean pinball loss for Austin against the full work-type class (cascade2), with 95% week-block intervals. Negative means better.

| Austin, how the thin trade classes are handled | q0.9, 2021 | q0.9, 2022 | q0.5, 2021 | q0.5, 2022 |
|---|---|---|---|---|
| folded into "other" (session 81) | -9.3 | -4.6 | +8.5 | +4.4 |
| folded to missing (this session) | -1.2 (-1.4 to -1.1) | +1.1 (0.7 to 1.4) | +1.0 (0.8 to 1.3) | -1.8 (-2.3 to -1.4) |
| missing, and the sources' thin rows dropped (post hoc) | -13.0 (-13.9 to -12.1) | -5.4 (-7.4 to -3.0) | +4.6 (4.0 to 5.3) | +5.6 (4.2 to 6.8) |
| plain permit-type class, no work type | -15.3 | -9.8 | +2.6 | -3.1 |

Folding to missing fixed the median, as predicted, but it gave back nearly all of the tail gain. Two of the five predictions held: San Francisco and Seattle don't move. The other three failed. The reason is in how gradient-boosted trees treat missing values. The 42 to 480 slow Seattle trade permits behind each thin class are still in the training data, now labelled missing. They train the very branch that Austin's trade permits follow at prediction time. A category marked missing is still learned from the rows that carry it. It only behaves as unseen if no training row carries it.

We checked that with a post-hoc run, labelled as such and with its predictions written after seeing one Austin year. This time the sources' thin-class rows were dropped from training altogether. The tail came back: 11.8 and 6.5 days better than folding to missing, with both intervals below zero. But the median cost returned (4.6 and 5.6 days). And the plain permit-type class still beats every fold rule in Austin, at both quantiles and in both years. What the work-type class costs Austin is not only the thin trade classes. It also changes which source rows sit beside Austin's other permits.

What this means for anyone borrowing a duration model across cities:

- If you want a rare category to behave as unseen in LightGBM, drop its source rows. Setting it to NaN is not enough.
- No single class configuration wins in every target city. The work-type class gives San Francisco 16 to 23 days at q0.9 and costs Austin 10 to 15. Three fold rules have now failed to fix that from source data alone. The next step is to pick the class configuration per target city on that city's own history, before the test year.

Code, results and the full log: [`research/build-data`](../../research/build-data/README.md), session 82 in [`LOG.md`](../../research/build-data/LOG.md).
