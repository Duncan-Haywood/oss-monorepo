---
title: "Pick the shrinkage prior by kind of subgroup, then stop re-choosing it"
date: 2026-11-16
description: "Choosing each subgroup kind's shrinkage prior from the other survey items agrees with the rule 37 of 39 times, but the two misses erase most of the gain"
tags: [research, christian-belief-models, small-area-estimation, empirical-bayes, survey-imputation, GSS]
---

Yesterday's run in the [christian-belief-models](/research/christian-belief-models/) programme found a rule for estimating a subgroup's answer to a survey item it was mostly not asked. The estimator shrinks the subgroup's small calibration sample toward a prior guess of how wrong a transferred model is. Which guess works depends on the kind of subgroup. For 2016–24 respondents, use the other traditions' miss on the same item. For immigrant generations, use zero. For Christian traditions, use an additive pair-plus-item fit. But that rule was read off the same 13 items it was scored on. A survey designer only knows the items already fielded. So today's question: can the rule be chosen without the item being rotated, and does it keep its gain?

The test held out each of the 13 General Social Survey items in turn and deleted its column from the matrix of model misses. For each kind of subgroup, it picked the prior with the smallest leave-one-out error on the other 12 items. It then scored the 227 subgroups on the held-out item. Six predictions were written before the run.

- **The choice is stable.** Recent-decade groups picked the other groups' miss in 13 of 13 folds. Generations picked zero in 12 of 13, and traditions picked the additive fit in 12 of 13. All three predictions held.
- **The gain mostly isn't.** The re-chosen prior has 0.83 of the zero prior's mean squared error at 50 respondents per group (item-cluster bootstrap 0.74–0.95). The predicted ceiling was 0.70, and it is worse than the additive fit used everywhere (0.73). At 400 respondents it is 4.5% worse than zero. That prediction was refuted. It is still 17% better than zero at 50, so the pre-registered test of whether the by-kind rule was an artefact did not trigger.
- **Two folds did all the damage.** Hold out same-sex marriage, and the traditions' winner on the other 12 items is a rank-2 matrix completion, by a small margin (4.7 against 6.4 points RMS). It then misses the 12 tradition groups on same-sex marriage at 4.6 times the zero prior's error. Ever divorced does the same to 3 generation groups (3.1 times). Those 15 groups are 7% of the total, but they add 0.16 of the zero prior's total error. The fixed rule, scored in-sample, gets 0.65.

One correction to yesterday's post: the per-cell selector it called "too noisy" was not really choosing cell by cell. Its error estimates are averages over the same kind's other items, so it made the same pick for every group of a kind on an item. It agrees with today's per-kind selector on all 227 groups. Its failure was these same two choices, not noise.

The practical reading for anyone rotating religion items off a split ballot: decide the prior by kind of subgroup ahead of time, and don't re-choose it from error on the items already fielded. With 12 items, one dominant item moves that error enough to flip the choice. The 0.65 for the fixed rule is in-sample. Only a second survey with the same items can test it honestly, which is where this programme goes next. Code, tables and the log with the predictions are in the [project directory](/research/christian-belief-models/).
