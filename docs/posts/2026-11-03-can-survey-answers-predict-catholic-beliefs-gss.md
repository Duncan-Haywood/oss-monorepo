---
title: "Can your other survey answers predict what you believe about marriage? Catholic and Protestant beliefs in 50 years of GSS data"
date: 2026-11-03
description: "Using GSS 1972–2024, a model predicts a Catholic's unasked answers on Mass attendance, premarital sex, same-sex marriage and abortion with AUC 0.75–0.88. The associations carry over to immigrants and Protestants; the levels do not."
tags: [religion, catholic, protestant, immigration, marriage, survey-methods, machine-learning, research]
---

# Can your other survey answers predict what you believe about marriage?

The General Social Survey has asked Americans about religion since 1972. It never asks everyone
everything. To keep interviews short, many questions go on only some ballots. So each respondent
has answered a few religion and morality items and has, by design, never been asked the rest.
That makes the GSS a clean test of a simple question: **if you know how a Catholic answered
some questions, how well can you predict the ones they were not asked?** And does what a model
learns about one group of Christians hold for another?

This is the first result of a new open research programme,
[`research/christian-belief-models`](../../research/christian-belief-models/README.md).

## How well it predicts

We trained models on 75,699 GSS respondents, weighted to the population. Each model fills in a
masked item from the respondent's other answers and demographics, and is scored on people it
never saw (5-fold cross-validation). AUC is the chance that the model ranks a random "yes" above a
random "no": 0.5 is a coin flip and 1.0 is perfect. The baseline is the share for the
respondent's decade, which is what a published table would give you.

For Catholics:

| Unasked item | Decade share alone | Model |
|---|---:|---:|
| Attends Mass weekly or more | 0.60 | **0.86** |
| Sex before marriage is always wrong | 0.61 | **0.85** |
| Opposes same-sex marriage | 0.74 | **0.88** |
| Living together unmarried is not acceptable | 0.56 | **0.82** |
| Opposes abortion for any reason | 0.55 | **0.75** |
| Adultery is always wrong | 0.56 | **0.73** |
| Divorce should be harder to get | 0.57 | **0.69** |
| Has ever divorced or separated | 0.56 | **0.71** |
| Pope is infallible on faith and morals | 0.54 | **0.69** |

Beliefs about sexuality hang together tightly. Views on divorce law, papal infallibility and
someone's own divorce are much harder to read off the rest of a profile. The answers that carry
the most signal are the obvious ones: how strongly someone identifies with their religion, how
often they attend and pray, and how they answered the neighbouring morality questions. Survey
year matters a lot for same-sex relations, where opinion moved fastest. A flexible
gradient-boosting model beats plain logistic regression by a median of only 0.003 AUC.

## What carries over to immigrants and to Protestants

The question we cared most about was transfer. **A model learned only on third-generation
Catholics** (US-born, with US-born parents) ranks **foreign-born Catholics** almost as well as a
model that saw them, within 0.03 AUC on 12 of 13 items. But it gets their *levels* wrong. It
under-predicts how many foreign-born Catholics are certain God exists by 11 points, and how many
oppose same-sex marriage by 8. It over-predicts belief in an afterlife by 10 points.

The same holds across traditions. A Catholic-trained model ranks Evangelical, Mainline and Black
Protestants within about 0.01 AUC of models trained on those groups. Yet it under-predicts
Evangelicals' "sex before marriage is always wrong" by 17 points. We had expected Black
Protestants to be the hardest group to transfer to. They were not, and that hypothesis is
logged as refuted.

In short, how beliefs fit together is much the same across these American Christian groups,
but how common each belief is differs a lot. For anyone imputing survey answers, the practical
rule is this: a single model is fine for ranking people, but it needs a group-level term for
generation, tradition and (we expect) country of origin, or its subgroup shares will be biased.

## A few trends in the raw data

Among Catholics, weekly Mass attendance fell from 41–48% in the 1970s to 14–19% in the 2020s, in
every immigrant generation. In the 2020s, foreign-born Catholics are the most likely to oppose
abortion for any reason (62% against 47% of third-plus-generation Catholics) and to hold that the
Pope is infallible (56% against 37%). These are self-reports, and self-reported attendance runs
high.

## Limits and what is next

- This is one cross-validation seed with bootstrap intervals, not the GSS's full design-based
  variance. The shares have not yet been checked against NORC's own published tables.
- The GSS has too few Orthodox Christians (27–205 per item) to model.
- Global and immigrant-origin comparisons need the European and World Values Surveys and ISSP,
  which require archive registration.
- Next come multiple seeds, calibration, proper multiple-imputation baselines (MICE, Bayesian
  mixtures) and a local-language-model baseline.

Everything uses anonymised public survey data. "Prediction" here means filling a survey
respondent's unasked question and measuring how wrong that is. It is not, and is not meant to
become, a way to guess a named person's religion.

*Data: Davern, Bautista, Freese, Herd and Morgan, General Social Survey 1972–2024, NORC at the
University of Chicago. Analysis AI-assisted (Claude). Code, tables and the pre-registered
hypotheses: [`research/christian-belief-models`](../../research/christian-belief-models/README.md).*
