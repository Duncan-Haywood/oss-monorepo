---
title: "One extra variable, the decade, takes a quarter off a mixture imputer's error"
seo_title: "Period-aware DPMPM imputation of a held-out GSS survey year"
date: 2026-11-12
tags: [research, christian-belief-models, surveys, religion, imputation, multiple-imputation]
description: "Adding the survey decade to the Si-Reiter mixture cuts its error on held-out GSS Catholic years from 4.8 to 3.55 points and same-sex marriage from 20 to 11.5."
---

Yesterday's post in the [christian-belief-models](/research/christian-belief-models/) programme ended on a claim. Two imputation models built on opposite assumptions, chained equations (MICE) and the Bayesian latent-class mixture of Si and Reiter (2013), DPMPM for short, missed a held-out General Social Survey (GSS) year by nearly the same amount: 4.7 and 4.8 points. Interpolating between the neighbouring years missed by 3.4. My reading was that neither model's design was the problem. Both pool fifty years of answers into one joint distribution and so cannot see the period.

That reading makes a prediction you can test. Give the mixture the period and it should improve sharply. Withhold the period and the model should stay where it was.

So this run repeated the mixture exactly: same 13 Catholic items, same 307 held-out item-years, same sampler settings and seeds. The only change was one more categorical variable, the respondent's survey decade. The exact year is still hidden. The held-out year's respondents can only borrow the item from respondents in the same decade whose ballot asked it. I wrote the predictions into the research log before the full run.

| method | mean error, points |
|---|---:|
| mixture, no period (yesterday) | 4.81 |
| MICE | 4.66 |
| **mixture + decade** | **3.55** |
| the decade's mean share | 3.54 |
| interpolating neighbouring years | 3.43 |
| **mixture + decade, averaged with interpolation** | **3.15** |

- **Error.** The period cut the mixture's error by 1.26 points (paired 95% interval 0.94 to 1.58), about a quarter.
- **Same-sex marriage.** The miss on opposing same-sex marriage fell from 20.3 points to 11.5.
- **Same-sex relations.** The miss on "same-sex relations always wrong" fell from 10.5 to 5.7.
- **Coverage.** Rubin 95% intervals covered 92% of item-years instead of 82%.
- **Predictions.** Four of the five predictions held, including the one I least wanted to hold: the model still does not beat interpolation.

Its error lands almost exactly on the error of the plain decade mean, 3.55 against 3.54 points. As a share estimator, the period-aware mixture has learned roughly what the decade's other ballots already say, and little more. The other answers help it rank people (milestone 1 put the AUCs at 0.7 to 0.9), but not get a wholly unseen year's level. Averaged with interpolation it does give the lowest point error the programme has found, 3.15 points. That is a small step past the 3.23 of the earlier neighbour-anchored average.

The practical reading for anyone filling in a skipped GSS ballot: if you use a joint imputation model, put the period in it. Without the period, the model's intervals will tell you a 1990s same-sex-relations share is known to within a few points when it is off by ten. Finer is not better. A second arm with five-year bins in place of decades scored 3.59 points, and my one prediction that missed was that it would beat the decade on same-sex relations (5.9 against 5.7). The classes also do not split by period. A median 2% of a held-out year's respondents sit in classes drawn mostly from their own decade. The period works by tilting which mixed classes a respondent falls into. The [research log](/research/christian-belief-models/) has the full tables and the caveats: one chain per item-year, an unweighted mixture, binned demographics, and a Kish effective sample size in place of the GSS design.
