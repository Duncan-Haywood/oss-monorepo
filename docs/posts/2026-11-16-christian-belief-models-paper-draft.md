---
title: "Rotating a survey item off a subgroup's ballot: the paper draft"
date: 2026-11-16
description: "Seven pre-registered GSS experiments, one argument: keep a calibration subsample, shrink toward the transferred model, borrow only shared drift"
tags: [research, christian-belief-models, survey-methodology, small-area-estimation, GSS]
---

The [christian-belief-models](/research/christian-belief-models/) programme has spent a week on one practical question. A long survey asks an item on only some ballots. A subgroup, say foreign-born Catholics or one tradition's 2016–24 respondents, then has few or no answers to it. A model trained where the item was asked can fill the gap. How wrong is the subgroup's share then, and what must still be asked?

Seven experiments on the General Social Survey answered pieces of that, each with its predictions written down first. Today they became one argument: a [methods-paper draft](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/christian-belief-models/paper/draft.md) aimed at *Sociological Methods & Research*. A script checks every number in it against the results files, 71 checks in all. No new experiment was run for it.

The argument in four steps:

- **The model ranks people well and still misses the level.** Across 241 transfers between generations, traditions and decades, the transferred model misses the target's share by 5.6 points on average. Only a median 0.8 points of that is covariate shift, the part that reweighting can fix without new answers. The rest, a median 3.5 points, is the group answering this item differently from similar people elsewhere. The group's answers to the other items do not recover it.
- **So keep a calibration subsample, and size it with one formula.** Using the model with the subsample saves about a sixth of the respondents, not half. Below a break-even n* = var(y − f)/b², median 91 people, the model alone is better. The formula lands within a factor of two of the simulated crossover in 99% of the cells where that can be checked.
- **With several groups, shrink; don't fiddle with the split.** Neyman allocation moves the error by under 1%. Shrinking each group's correction toward the model, with the variance taken from items already fielded, halves the group-average error at 50 respondents per group. The robust empirical Bayes interval keeps 94–97% average coverage at 0.83 of the plain interval's width.
- **Borrow other groups' misses only where the drift is shared.** For 2016–24 groups, the other traditions' miss on the same item is almost as good as knowing the bias. For generations and traditions, no prior beats zero reliably. A rule fixed in advance keeps about half its gain on seven GSS items it never saw. Re-choosing the prior by error on the items already fielded loses most of it.

The draft also counts its own record. The seven steps made 40 numbered predictions before seeing results: 23 held, 5 held in part and 12 were refuted. One refutation changed the design. The asked items did not carry the unasked item's shift, and that is why every later step keeps a calibration subsample.

What is missing before submission: a second survey to test the rule out of sample, a design-based variance that respects the GSS's clustered ballots, print figures, and a hand check of 9 citations this session could not look up.
