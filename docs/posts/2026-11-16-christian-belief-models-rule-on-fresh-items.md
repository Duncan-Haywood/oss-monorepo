---
title: "A shrinkage prior rule, tested on survey items it never saw: half the gain survives"
date: 2026-11-16
description: "Fixed in advance, the by-kind prior rule cuts subgroup error to 0.85 of the zero prior's on 7 fresh GSS items, against 0.65 on the items it came from"
tags: [research, christian-belief-models, small-area-estimation, empirical-bayes, survey-imputation, GSS]
---

The last post in the [christian-belief-models](/research/christian-belief-models/) programme ended on a caveat. A rule for estimating a subgroup's share on a survey item it was mostly not asked looked good, but it had been read off the same 13 General Social Survey items it was scored on. The estimator shrinks a small calibration sample toward a prior guess of how wrong a transferred model is. The rule says which guess to use for each kind of group:

- 2016–24 respondents: the other traditions' miss on the same item.
- Immigrant generations: zero.
- Christian traditions: an additive pair-plus-item fit.

In-sample it reached 0.65 of the zero prior's mean squared error at 50 respondents per group. The post said only a second survey could test it honestly.

There turned out to be a cheaper honest test. The GSS download host had refused this container's proxy for five runs, and today it served the file again. The GSS asks many moral items that were never among the 13. So the rule was frozen and the predictions were written to the log. Then the transferred models were fitted on fresh items and the rule was scored on them. The primary set has seven items, each coded to the answer consistent with Catholic teaching: euthanasia, assisted suicide, the death penalty, marijuana legalisation, pornography law, teen sex and teen birth control. The secondary set is six abortion sub-items, kept apart because the old abortion item nearly determines them. As a pipeline check, refitting the 13 old items reproduced all 228 earlier model misses exactly.

- **The rule survives, at about half strength.** On the seven fresh items it reaches 0.85 of the zero prior's error at 50 respondents per group (item-cluster bootstrap 0.76–0.92). On the abortion items it reaches 0.87, the best of the five priors there. Robust empirical Bayes intervals around it stay at 95–98.5% average coverage. The pre-registered test of whether the rule was only an in-sample artefact needed it to beat 0.95, and it did.
- **Nearly all the gain is the period part.** For 2016–24 groups, borrowing the other traditions' miss gives 0.38 of the zero prior's error on the fresh items (0.26 on the old ones). When a decade's groups drift together, which is what happened on marijuana (a 16-point miss) and teen sex (11 points), the other groups' miss is a good guess.
- **For traditions and generations the best prior is not stable.** One of six predictions failed. Rank-2 matrix completion beat zero for immigrant generations on the fresh items (0.79). Across all fresh items it would have done best overall. But on the old items it lost: re-scored there, the same variant gets 0.75, against 0.65 for the frozen rule. These are the same two failed choices the last post found, seen from the other side.

For a survey designer rotating religion items off a split ballot, the practical rule is short. When the subgroups differ by period, shrink toward the other groups' miss on the same item. When they differ by tradition or immigrant generation, shrink toward zero unless a second item set backs a structured prior. The caveats: this is a fresh-item test within the same survey, not a second survey; there are only seven primary items, so the bootstrap is coarse; and the abortion sub-items track the old abortion item. Code, tables and the log with the predictions are in the [project directory](/research/christian-belief-models/).
