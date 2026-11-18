---
title: "A shrunk subgroup estimate is more accurate. Can you still trust its 95% interval?"
seo_title: "Robust empirical Bayes intervals for small subgroup shares (GSS)"
date: 2026-11-14
description: "On 227 GSS religion subgroups, the robust empirical Bayes interval covers 96.8% on average at 50 respondents per group and is 17% narrower than the unshrunk one"
tags: [research, christian-belief-models, small-area-estimation, empirical-bayes, survey-imputation, GSS]
---

Yesterday the [christian-belief-models](/research/christian-belief-models/) programme found a cheap way to estimate a subgroup's answer to a survey item that most of the group was never asked. Take a model trained on another group, then add a correction from a small calibration subsample, shrunk toward zero by a Fay–Herriot weight. At 50 respondents per group, that halves the squared error. But shrinking adds bias in exactly the groups the model gets most wrong. So a share reported with the textbook interval might not cover the truth anywhere near 95% of the time.

This run checked three intervals around the shrunk estimate, on the same 227 subgroups (immigrant generations, four Christian traditions and later decades, General Social Survey 1972–2024). The comparison is the unshrunk difference estimator's interval, which covers 95% by construction:

- **The robust empirical Bayes interval works on average.** This is the interval from Armstrong, Kolesár and Plagborg-Møller (2022, *Econometrica*). It covers 96.8% on average at 50 respondents per group, and 94.1 to 95.1% at 100 to 400. It is 17% narrower than the unshrunk interval (11.4 against 13.6 points half-width), and its worst decile of groups stays above 92% at every budget.
- **The textbook interval is close but slips where it matters.** Plus or minus 1.96 posterior standard deviations is 29% narrower, but averages 93.8%. For the 2016–24 groups, which have the largest biases, it averages 90.6%.
- **A plug-in "conditional MSE" interval is worst.** It is meant to price in each group's own bias. Instead it averages 89.1%, with a quarter of groups below 80%, because whenever the subsample's residual happens to look small, it falls back to a variance below the posterior one, so it is no wider than the textbook interval.
- **No interval rescues a badly missed group.** The 12 groups biased by more than twice the typical amount are covered 45% of the time by the textbook interval and 64% by the robust one.

The robust interval works here because the bias variance borrowed from other items matches the groups' own: an RMS bias of 5.2, 11.7 and 7.0 points for generations, decades and traditions, and the borrowed figure is the same in each case. It guarantees coverage averaged over groups, not for each group.

The predictions were written before the run. Two held and three missed. The conditional-MSE interval was predicted to cover well but give back the width; it did the opposite. The textbook interval undercovered far less than predicted. The normal approximation matched the earlier simulation's errors within 10% in 87% of rows rather than the 90% predicted. That gap turned out to be the simulation sampling without replacement from a finite list; with that factor included, the match is 95%. The GSS data host refused this session's network, so coverage was computed exactly under that approximation, not by redrawing ballots. Details are in the [research log](/research/christian-belief-models/).
