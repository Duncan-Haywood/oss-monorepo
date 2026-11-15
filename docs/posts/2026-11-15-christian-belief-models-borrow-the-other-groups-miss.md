---
title: "Which subgroup is the model getting wrong? Ask the other subgroups"
seo_title: "Small-area shrinkage toward other groups' bias: GSS religion subgroups"
date: 2026-11-15
description: "Shrinking toward the other traditions' miss cuts 2016–24 subgroup error to 0.26 of a zero prior's, matching an oracle; it fails for immigrant generations"
tags: [research, christian-belief-models, small-area-estimation, empirical-bayes, survey-imputation, GSS]
---

The [christian-belief-models](/research/christian-belief-models/) programme estimates a subgroup's answer to a survey item that the subgroup was mostly not asked. A model trained on another group gives a first guess. A small calibration subsample corrects it, and the correction is shrunk toward zero by a Fay–Herriot weight. That halved the error at 50 respondents per group. An oracle that knew each group's bias in advance did twice as well again. This run asked whether a designer can get some of that oracle's knowledge from data they already have: the model's misses on *other* subgroups and *other* items.

The data are the same 227 subgroups as before, from the General Social Survey 1972–2024: immigrant generations, four Christian traditions, and the 2016–24 respondents of each tradition. The setup: an item is rotated off one subgroup's ballot, and every other subgroup is still asked it. Four ways to set the shrinkage target were compared against zero, each built without the target cell:

- **For the recent-decade groups, it works almost perfectly.** Shrinking toward the other traditions' 2016–24 miss on the same item cuts the mean squared error to 0.26 of the zero prior's at 50 respondents per group. The oracle gets 0.27. Same-sex marriage dominates: the model misses the recent groups by 35 to 43 points there. Drop that item and the ratio is still 0.54 (bootstrap 0.33–0.82).
- **For immigrant generations, it backfires.** The other generations' miss points the wrong way, and the error rises to 1.5 times. On belief in God, first- and third-generation Catholics are missed in opposite directions.
- **For traditions, it is noise.** A pair-plus-item additive fit gets 0.91 of the zero prior's error, with an interval from 0.74 to 1.11.
- **Intervals stay honest.** The robust empirical Bayes interval around the best prior covers 94.8 to 98.4% on average. It covers the 12 worst-missed groups 93% of the time, up from 64%.

Two ideas did not pan out. Scaling each group's prior variance by its own misses on other items made things slightly worse. A rule picking the prior cell by cell, from the smallest leave-out error, did worse than any fixed choice. It picked a rank-2 completion for a few tradition cells, and those cells came out at 4.6 times the error.

So the practical rule is by kind of subgroup. For a recent decade, borrow the other groups' drift. For immigrant generations, keep the zero prior. For traditions, the question is still open. Five predictions were written before the run. Two held, one held only on its point estimate, and two missed: the own-scale prior was slightly worse than the 5% band allowed, and the rank-2 completion came out worse than the additive fit. A unit test showed why the rank-2 completion is weak: centring the matrix adds a rank, so one hidden cell is not pinned down. The checks made after seeing the results are labelled as such in the [research log](/research/christian-belief-models/). The setup assumes the other subgroups were asked in full, so it is an upper bound for a design that drops an item from several groups at once. That case is next.
