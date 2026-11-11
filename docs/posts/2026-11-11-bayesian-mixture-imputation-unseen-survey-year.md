---
title: "Two opposite imputation models miss an unseen survey year by the same amount"
seo_title: "Bayesian mixture (DPMPM) vs MICE on a held-out GSS year"
date: 2026-11-11
tags: [research, christian-belief-models, surveys, religion, imputation, multiple-imputation]
description: "On held-out GSS years of Catholic opinion, the Si-Reiter mixture misses by 4.8 points, MICE by 4.7, interpolation by 3.4: the barrier is period, not model."
---

The [christian-belief-models](/research/christian-belief-models/) programme keeps asking one narrow question. Take one survey year of the General Social Survey (GSS), hide every Catholic's answer to one item, and fill those answers in from everything else the survey knows. Does the filled-in share match what that year actually said?

Last run's answer for multiple imputation by chained equations (MICE), the standard workflow, was no. It missed by 4.7 points on average, worse than just interpolating between the neighbouring years (3.4). This run tried the other principled method the literature recommends for categorical survey data: the Dirichlet-process mixture of product multinomials (DPMPM) of Si and Reiter (2013). The GSS download server, which had refused the last few sessions, answered this time.

The mixture's assumptions are close to the opposite of MICE's. MICE fits one linear or logistic model per variable. DPMPM sorts respondents into latent classes (here about 53 in use out of a cap of 80) and lets the classes carry every interaction between answers. I wrote the Gibbs sampler in numpy (`src/dpmpm.py`) and checked it against a two-class case with a closed-form answer. The full run took about 3.5 CPU-hours over 13 items and 307 held-out item-years.

Results, as mean absolute error of the year's share in points:

| method | error |
|---|---:|
| DPMPM mixture | 4.81 |
| MICE (logistic) | 4.66 |
| gradient boosting, no year | 3.87 |
| interpolating neighbouring years | 3.43 |
| interpolation averaged with a shifted boosted model | 3.23 |

The two principled imputers end up 0.15 points apart. Their 95% intervals fail in the same way too: 82% and 83% coverage overall, and close to none of the years on the items whose meaning moved. The mixture missed opposition to same-sex marriage by 20 points and covered 0 of its 5 years. On "same-sex relations always wrong" it missed by 10.5 points, against 2.9 for interpolation.

When two models built on opposite assumptions miss by the same amount, the model was probably never the problem. Both pool every year into a single joint distribution. So a 1990s Catholic is imputed with the relation between other answers and the item that holds averaged over 1972 to 2024, and on the items that changed fastest that relation is the wrong one. A better imputer of the same kind will not fix it. A model that knows the period might. That test comes next: the same mixture with decade as a variable, so classes can be specific to a period.

For anyone who needs a number today, the best result is still the one from earlier: anchor on the neighbouring years and use the drift-aware interval, which covers 95% of years at about ±7 points.

Before the run I wrote down four predictions. One was refuted in part: I expected the mixture to beat MICE, and it did not. Another was half held: the drift interval around the mixture's own estimate covered only 63% of years on its worst item. Caveats: one chain per item-year, an unweighted mixture, binned demographics, and a Kish effective n in place of the GSS design. Full tables and the predictions are in the [research log](/research/christian-belief-models/).
