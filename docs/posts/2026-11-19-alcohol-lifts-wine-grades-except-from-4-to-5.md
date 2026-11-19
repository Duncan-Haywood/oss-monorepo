---
title: "Alcohol lifts a red wine's grade, except from a 4 to a 5: a free ordinal regression tool with Brant's test"
seo_title: "Free ordinal logistic regression online, with Brant's test"
date: 2026-11-19
tags: [ordinal-regression, proportional-odds, ordered-logit, brant-test, likert, research-algorithms, browser]
description: "An ordered logit on 1,599 red wines: alcohol multiplies the odds of a higher grade by 2.43, but Brant's test shows it barely moves a 4 to a 5."
---

Experts graded 1,599 Portuguese red wines from 3 to 8. Which laboratory
measurements go with a higher grade? The new
[ordinal regression tool](../../ventures/ordinal-regression/) fits the model
built for this kind of outcome, the proportional-odds model (an ordered
logit). Its headline is clear: each extra percentage point of alcohol
multiplies the odds of a higher grade by 2.43 (95% interval 2.17 to 2.72).
Holding the other five measurements at their means, a 9.5% wine has a 59%
chance of being graded 5, and a 12.5% wine has a 33% chance of a 7 or 8.

The second half of the output says that single number hides something.

## One odds ratio for the whole scale is an assumption

An ordered logit gives each predictor one odds ratio, and it applies at every
cut of the scale. The odds of a 6 or better against 5 or worse move by the
same factor as the odds of a 4 or better against a 3. That is the
proportional-odds assumption. Brant's (1990) test checks it. It fits a
separate binary logistic regression at each cut ("above 3?", "above 4?", …),
then tests whether their slopes agree.

On the wines they don't (chi-square 92.8 on 24 degrees of freedom,
p < 0.0001). The per-cut slopes for alcohol are:

| Cut | above 3 | above 4 | above 5 | above 6 | above 7 |
| --- | ---: | ---: | ---: | ---: | ---: |
| alcohol slope | 1.22 | **0.28** | 0.89 | 1.00 | 1.17 |

Alcohol barely separates the 4s from the 5s (0.28, standard error 0.17). It
does a lot of the work everywhere else. Total sulfur dioxide is stranger: its
slope is positive at the two lowest cuts and negative at the top three, so the
pooled "slightly negative" coefficient averages two opposite patterns.
Sulphates and chlorides pass the test.

That doesn't make the model useless. It means you should report the
predicted probabilities, or the per-cut slopes, next to the 2.43. The page
shows both: a stacked chart of the chance of each grade as any predictor
moves, and a Brant table with each binary logit's slope under its cut.

## What the tool does

You paste a CSV with an ordered outcome and some predictors. The outcome can
be a 1 to 5 rating, a Likert answer, a grade or a stage. The predictors can be
numbers, or text columns such as a treatment arm, which become dummy
variables against a reference level. The tool puts the levels in order by
itself when they are numbers, numbered labels ("1 - Poor") or a common answer
scale (Strongly disagree … Strongly agree, Never … Always, Poor … Excellent,
None … Severe). Otherwise it asks you for the order. You get:

- each coefficient with its standard error, p-value and interval, the odds
  ratio per unit and per standard deviation, and the cut-points;
- the likelihood-ratio test against no predictors, McFadden's pseudo R², AIC
  and BIC;
- Brant's test, overall and per predictor, with the per-cut slopes;
- the chance of every level at a profile you set;
- an ordered probit as an alternative link.

It runs in the browser, and nothing is uploaded. The same engine runs from
the command line (`node cli.mjs data.csv`) and as an agent tool.

## How it was checked

The fit is Newton-Raphson on the exact gradient and Hessian, with the
predictors scaled during the fit. On the wine data, a simulated Likert survey
and a data set built to break proportional odds, its log-likelihoods match
statsmodels' `OrderedModel` within 3 × 10⁻¹². That holds for both links. The
coefficients agree to about 10⁻⁸ and the standard errors to about 10⁻⁶;
statsmodels takes its Hessian numerically. Brant's statistics match a numpy
implementation of the formula within 10⁻¹⁰. On the planted violation, the
test flags the predictor that was built to break the assumption (p < 10⁻¹⁰)
and passes the one that wasn't.

We also checked that the test isn't trigger-happy. We simulated 400 data sets
where proportional odds holds by construction. Brant's test rejected 6.0% of
them at the 5% level, close to the nominal 5%.

## Limits

The intervals are Wald intervals, not profile-likelihood ones. When Brant's
test fails, the tool shows you where but doesn't fit the alternatives
(partial proportional odds, a generalised ordered logit). Those are the next
candidates. It doesn't handle interactions, repeated answers from the same
person, or survey weights. And a coefficient describes an association: the
wines weren't randomly assigned their alcohol.

The data are the UCI Wine Quality set (Cortez et al. 2009, CC BY 4.0). These
numbers describe one style of wine, not wine in general.
