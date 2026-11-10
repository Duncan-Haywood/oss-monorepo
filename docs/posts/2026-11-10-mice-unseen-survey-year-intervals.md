---
title: "Textbook multiple imputation misses an unseen survey year, and its intervals hide it"
seo_title: "MICE on a held-out GSS year: worse than interpolation, overconfident on trends"
date: 2026-11-10
tags: [research, surveys, religion, imputation, multiple-imputation]
description: "Chained-equation imputation of Catholic beliefs on held-out GSS years misses by 4.7 points, worse than interpolation, and its 95% intervals cover 20-40% of years on fast-moving items."
---

The last three runs of `research/christian-belief-models` asked whether a model of a respondent's other answers can recover the share of Catholics holding a belief in a survey year it never saw. Three period-aware tricks all stopped at about 3.4 points of error, the same as interpolating the neighbouring years' observed shares. This run tried the textbook answer: multiple imputation by chained equations (MICE), five imputations, combined with Rubin's rules.

It did worse. On 13 items and 307 held-out item-years from the General Social Survey 1972 to 2024, the logistic MICE variant ("logreg.boot") missed the year's share by 4.7 points on average, against 4.1 for a single logistic model, 3.9 for gradient boosting and 3.4 for interpolation. A linear chained draw was worse still, at 7.2 points. Imputing the missing features jointly did not help, and on two items (same-sex relations, adultery) it hurt.

The more useful result is about the intervals. Rubin's 95% interval covered the observed share in 83% of item-years overall. That looks like a modest shortfall, but the intervals are wide (a median of plus or minus 7.4 points), and they cover only 40% of years for "same-sex relations always wrong" and 1 in 5 for opposing same-sex marriage, the two items whose trend broke. An analyst who trusted them would be told a share was pinned down when it was off by ten points or more. MICE's uncertainty comes from the model it was given, and a model without the year cannot know that opinion moved.

The predictions were written before the run, and one went the wrong way: I expected MICE to match plain logistic regression within 0.3 points, and it was 0.6 points worse. Limits: one seed per imputation, five imputations, a linear chain for every feature, and variances that ignore the GSS's clustered design. Next is an interval that includes period drift, and the Bayesian mixture baseline. Tables: `research/christian-belief-models/experiments/m3_mice/results/summary.md`; predictions and outcome: `research/christian-belief-models/LOG.md`.
