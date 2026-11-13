---
title: "One calibration budget, several subgroups: the split barely matters, the estimator does"
seo_title: "How to split a survey calibration budget across subgroups"
date: 2026-11-13
description: "With one budget for several subgroups asked a rotated survey item, Neyman allocation moves the error under 1%. Shrinking each group's correction toward the model halves it."
tags: [research, christian-belief-models, survey-methods, small-area-estimation]
---

# One calibration budget, several subgroups: the split barely matters, the estimator does

A survey that rotates an item off some ballots can still report the item's
share for a subgroup, if a model trained where the item *was* asked predicts
it, and if some of the subgroup were asked it after all. The earlier step of
this programme sized that calibration subsample one group at a time: adding
the subsample's mean residual to the model's average (the difference, or
prediction-powered, estimator) needs about 17% fewer respondents than their
plain mean, and below a break-even of roughly 91 respondents the model alone
beats a small subsample.

A designer never has one group. They have a budget and three or four
subgroups — traditions, immigrant generations, later decades — and two levers:
where the respondents go, and how far each group's estimate trusts the model.

We simulated both on the GSS 1972–2024 cumulative file: 73 families of 2 to 4
subgroups sharing an item, 13 items, 300 draws each, budgets of 50 to 400
respondents per group. The predictions were written in the project's log
before the run.

## Allocation is a dead end

Neyman allocation — more respondents where the residual is noisier — changes
the group-average error by under 1% at every budget. Binary survey items just
do not differ enough in residual variance for it to matter. Spending half the
budget on a pilot and then water-filling on its bias estimates is *worse*,
by 2 to 3%: the pilot's bias estimates are too noisy to allocate on.

An oracle that knows each group's true bias does far better (loss ratio 0.26
at 50 per group), and part of that is allocation — it gives 40% of groups
nothing at all, because the model already fits them. But that knowledge is
exactly what a designer does not have.

## Shrinkage is where the gain is

Fay and Herriot's small-area estimator does have it, in a usable form.
Correct the model's average by the subsample residual times
γ = τ²/(τ² + v), where v is the subsample's variance and τ² is how much the
model's bias varies across groups of this kind. Take τ² not from the family's
own three or four groups — that estimator collapses to zero too often and ends
up worse than no shrinkage at moderate budgets — but from the biases measured
on items the survey already fielded in full.

That halves the group-average squared error at 50 respondents per group: 6.8
points RMSE down to 4.7, about what the plain difference estimator reaches
with twice the budget. At 400 per group it still saves 11%. And, against our
own prediction, it does not sacrifice the worst group to the average: the
worst group's error falls to 0.75 of the unshrunk version's.

The gap to the oracle (0.50 against 0.26) is the standing value of knowing
*which* groups the model gets wrong. A better per-group prior for that bias is
the next thing worth building.

Numbers, code and the pre-registered predictions:
[`research/christian-belief-models`](https://marisstella.app/research/christian-belief-models/).
Caveat worth repeating: this is point error. Interval coverage for the shrunk
estimator is not tested yet, and a naive interval around a shrunk estimate is
expected to undercover where the bias is large.
