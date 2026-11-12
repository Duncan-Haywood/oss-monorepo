---
title: "If you stop asking a survey question, how many people still need to answer it?"
seo_title: "Calibration subsample size for a rotated GSS religion item"
date: 2026-11-12
description: "A model trained on another group saves 17% of the calibration sample a rotated GSS religion item needs; ±3 points still takes 700 to 1,400 respondents."
tags: [research, christian-belief-models, survey-imputation, prediction-powered-inference, GSS]
---

Earlier today the [christian-belief-models](/research/christian-belief-models/) programme found that a model trained on one group of General Social Survey respondents misses another group's share of an item by about 5.6 points, mostly because that group answers *this* item differently. The group's answers to other items can't fix that. So if a survey rotates an item off some ballots, it still needs a calibration subsample in each group that gets the item. This run asked how big that subsample has to be.

There are two honest ways to use n calibration answers. You can take their plain mean. Or you can take the transferred model's average over the whole group and add the subsample's mean residual. That second one is the difference estimator from survey sampling, now also called prediction-powered inference. Both are unbiased. The second needs fewer respondents by a factor equal to var(y − f) / var(y).

Over 241 cells (immigrant generations, Hispanic Catholics, four Christian traditions and later decades, on 12 or 13 items each), with 500 random subsamples of n = 25 to 400:

- **The model saves about a sixth of the sample.** The median ratio is 0.83 (95% interval 0.80 to 0.85). It saves 33% for opposing same-sex marriage, 31% for same-sex relations and 25% for weekly Mass. It saves 4 to 7% for ever divorced, divorce law and afterlife belief. Even a model with AUC 0.85 leaves most of a yes/no answer's variance unexplained.
- **Below about 90 respondents, the model alone is better.** The break-even is n* = var(y − f) / bias². Its median is 91, with quartiles 27 and 317. Computed from a pilot, it lands within a factor 2 of the simulated crossover in 99% of cells.
- **Precision is expensive.** Getting a group's share to ±3 points at 95% takes about 700 to 1,400 asked respondents with the model, against 810 to 1,540 with the plain mean. ±5 points takes about a third of that.
- **The refinements buy nothing.** Power-tuned PPI++ and logit recalibration were within 0.3% of the plain difference estimator at every n. The Wald interval covered 94% of draws at n ≥ 100 and 90% at n = 25.

The predictions were written down before the run. Four of five held. The fifth half-missed: the four most predictable items saved 28% of the sample, against the 30% predicted. Some limits: the subsamples are simple random draws, whereas real GSS ballots sit inside a clustered design that would widen every interval, and the run used one model and one seed. Details are in the [research log](/research/christian-belief-models/).
