---
title: "Can you predict divorce? We tried more data, more questions and smarter models"
seo_title: "Can you predict divorce? More data, questions and models tried"
date: 2026-10-20
description: "Nine surveys, 44 inputs, boosting, forests and a pooled Bayesian model: what predicts divorce, what does not, and why more data stopped helping."
tags: [research, divorce, marriage, machine-learning, statistics, decision-aid]
---

# Can you predict divorce? We tried more data, more questions and smarter models

Almost everyone who has thought about marrying has wondered about the odds. This repository has
a free [divorce risk calculator](/research/marriage-divorce-evidence/app/) built on public
survey data. It is mostly American: the National Survey of Family Growth, the National
Longitudinal Surveys of Youth, the General Social Survey, the How Couples Meet and Stay Together
study, SIPP and the American Community Survey, plus Statistics Canada's General Social Survey
and a 12-year study of Los Angeles newlyweds.

A first version gave modest numbers, and the obvious question followed: surely more data, more
questions and a better model would do better? So we tried all three, and tested every change on
people the model had never seen.

## More questions: they sort risk, but they don't predict it

We added every pre-marriage question the surveys hold:
- finer race and ethnicity, including 18 Asian subgroups and 11 Hispanic origins;
- whether your parents divorced, never married, or one of them died;
- religious attendance at nine levels, from "never" to "more than once a week";
- prayer, denomination, political views and party;
- occupation, and wealth.

Many of these do sort people:
- **Family of origin.** In Statistics Canada's 2017 survey, people whose parents never married
  each other separated at 1.59 times the rate of those raised by both parents. A parent's death
  made no difference (1.01).
- **Wealth.** In the NLSY79, each extra $100,000 of net worth before the wedding went with about
  10% lower risk.
- **Group rates.** In the ACS, yearly divorce rates run from 5 per 1,000 married Asian Indian
  Americans to 24 per 1,000 Black Americans. By income they run from 6 per 1,000 above $200,000
  to 32 per 1,000 below $25,000.

But once a model already knows the basics (ages, schooling, earlier marriages, children,
cohabitation, attendance), none of the new questions improved its predictions for new people.
The best case, religion plus politics in the GSS, added half a point with an interval running
from −0.6 to +1.6.

The new facts are not wrong. They overlap with what the model already knows.

## Smarter models: they memorise instead of learn

Next we gave flexible models a fair test: tuned gradient boosting (LightGBM), random forests,
extra trees, explainable boosting machines, interaction models and stacked ensembles, all with
nested cross-validation. On every survey that finished, the simple additive model was as good
or better.

The flexible models were memorising. On the GSS, LightGBM cut prediction loss by 44.5% on the
training data and by 7.4% on new data. The additive model managed 17% and 8.6%. Most of these surveys
follow a few thousand marriages with a few hundred divorces, which is too few for a forest to
find real interactions.

## More data: the curve has flattened

Two tests asked whether more data would help:
- **Learning curves.** Accuracy climbs steeply up to about half the data and is nearly flat
  after three quarters.
- **Feature curves.** Two to eight inputs carry most of the skill. On HCMST, four inputs reach
  99% of the full model.

We also pooled nine surveys, 321,121 people and couples, into one Bayesian model that fills in
the questions a survey never asked. It helped where data were thinnest: the HCMST couples and
the LA newlyweds. In the big surveys it was slightly worse than each survey's own model.
Effects carried from one survey to another; baseline divorce rates did not.

## What does predict divorce

The strongest signal comes from questions about the relationship itself. In the How Couples
Meet and Stay Together study, couples who rated their relationship "poor" broke up at 60%,
against 14% for "excellent". That lens separates married couples who stayed together from
those who split about 84% of the time (C-index 0.84). How long a couple dated before marrying,
another popular theory, made no measurable difference held out: break-up rates were about 8.5%
whether couples dated under a year or more than three.

Marital happiness also changes with time. In the GSS, 75% of people married two years or less
call their marriage "very happy", against 61% at 16–20 years. The dip is real; HCMST followed
the same couples and saw ratings fall. The later rise is partly an illusion, because unhappy
marriages leave the sample.

## So what is the calculator for?

It is a decision aid, not an oracle. The new **Profile report** tab shows, for you and for the
person you are considering:
- the predicted risk with them;
- the average with the kinds of partners people like you actually marry, and if you "dated
  everyone";
- where you sit against the population;
- which factors move your number most, labelled as changeable or fixed and graded by how good
  the evidence is that changing them helps.

The honest summary of the research is that population facts are solid and individual
prediction from survey answers is near its ceiling. Your own relationship is the part no survey
measured.

*Produced with AI assistance (Claude). The full write-up, with intervals and methods, is
[the report](/docs/reports/2026-10-20-divorce-prediction.md), and code and per-survey results
are in [`research/marriage-divorce-evidence/`](/research/marriage-divorce-evidence/). These are
associations in past surveys of other people's marriages, not advice about any person.*
