---
title: "Can you predict divorce? More data, more questions, smarter models"
date: 2026-10-20
description: "Nine surveys, 44 inputs, boosting and forests: what predicts divorce, what does not, and why more data and cleverer models stopped helping."
post: can-you-predict-divorce
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own write-up.

Almost everyone who has thought about marrying has wondered about the odds. This repository has a free divorce risk calculator built on public survey data. It is mostly American: the National Survey of Family Growth, the National Longitudinal Surveys of Youth, the General Social Survey, the How Couples Meet and Stay Together study, and the American Community Survey, plus a Canadian survey and a twelve year study of Los Angeles newlyweds.

The first version gave modest numbers. The obvious question followed: surely more questions, more data and a smarter model would do better? So we tried all three, and tested every change on people the model had never seen.

First, more questions. We added every pre-marriage question the surveys hold: finer race and ethnicity, whether your parents divorced or never married, religious attendance at nine levels, politics, occupation and wealth.

Many of these do sort people. In Statistics Canada's 2017 survey, people whose parents never married each other separated at one point five nine times the rate of those raised by both parents. A parent's death made no difference. In one American longitudinal study, each extra hundred thousand dollars of net worth before the wedding went with about ten percent lower risk. And in the American Community Survey, yearly divorce rates run from five per thousand married people in one group to twenty-four per thousand in another, and by income from six per thousand above two hundred thousand dollars to thirty-two per thousand below twenty-five thousand.

But once a model already knows the basics, ages, schooling, earlier marriages, children, living together and attendance, none of the new questions improved its predictions for new people. The best case, religion plus politics, added half a point, with an interval that ran from below zero to above one. The new facts are not wrong. They overlap with what the model already knows.

Second, smarter models. We gave flexible models a fair test: tuned gradient boosting, random forests, extra trees, explainable boosting machines and stacked ensembles, all with nested cross-validation. On every survey that finished, the simple additive model was as good or better.

The flexible models were memorising. On the General Social Survey, boosting cut prediction loss by forty-four and a half percent on the training data, but only seven point four percent on new data. The additive model managed seventeen percent and eight point six. Most of these surveys follow a few thousand marriages with a few hundred divorces. That is too few for a forest to find real interactions.

Third, more data. Learning curves climb steeply up to about half the data and are nearly flat after three quarters. Feature curves say two to eight inputs carry most of the skill. In one study, four inputs reach ninety-nine percent of the full model.

We also pooled nine surveys, three hundred and twenty-one thousand people and couples, into one Bayesian model that fills in the questions a survey never asked. It helped where data were thinnest. In the big surveys it was slightly worse than each survey's own model. Effects carried from one survey to another. Baseline divorce rates did not.

So what does predict divorce? The strongest signal comes from questions about the relationship itself. In the How Couples Meet and Stay Together study, couples who rated their relationship poor broke up at sixty percent, against fourteen percent for excellent. That separates couples who stayed together from those who split about eighty-four percent of the time. How long a couple dated before marrying, another popular theory, made no measurable difference: break-up rates were about eight and a half percent whether they dated under a year or more than three.

Marital happiness also changes with time. In the General Social Survey, seventy-five percent of people married two years or less call their marriage very happy, against sixty-one percent at sixteen to twenty years. The dip is real. The later rise is partly an illusion, because unhappy marriages leave the sample.

So what is the calculator for? It is a decision aid, not an oracle. Its profile report shows the predicted risk, how you sit against the population, and which factors move your number most, labelled as changeable or fixed, and graded by how good the evidence is that changing them helps.

The honest summary is that population facts are solid, and individual prediction from survey answers is near its ceiling. Your own relationship is the part no survey measured. These are associations in past surveys of other people's marriages, not advice about any person.

The written version of this episode is on the site's Writing page, with the links and the full report.
