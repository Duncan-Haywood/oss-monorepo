---
title: "Why a survey model trained on one Christian group gets another group's level wrong"
seo_title: "Covariate shift vs concept shift in religious survey imputation"
date: 2026-11-12
description: "A transferred GSS imputation model misses a group's share by 5.6 points. Covariate shift explains under a point; the group's other answers cannot fix the rest."
tags: [research, christian-belief-models, survey-imputation, GSS, domain-shift]
---

The [christian-belief-models](/research/christian-belief-models/) programme found early on that a model trained on one group of General Social Survey respondents ranks another group well but gets its *level* wrong: trained on third-generation Catholics, it misses foreign-born Catholics' certainty about God by 11 points. This run asked why, and whether the gap can be fixed without asking the item.

The error in a group's imputed share splits exactly into two parts. One is covariate shift: the target group has a different mix of ages, education, politics and other answers, and the source model fits poorly where that group lives. Importance weighting can estimate this part without any of the target's answers to the item. The other is concept shift: people in the target group with the *same* profile answer this item differently. Estimating that part needs the target's answers.

We fitted gradient boosting on one group and imputed each of 12 or 13 items for another, over 20 pairs: immigrant generations, Hispanic and non-Hispanic Catholics, every ordered pair of Catholic, Evangelical, Mainline and Black Protestant, and earlier against later decades. That gave 241 cells. The transferred model misses by 5.6 points on average. Covariate shift is a median 0.8 points, larger (1 to 4) between traditions and about 0.2 between generations and decades. Concept shift is a median 3.5 points.

So we tested the obvious fix, written down as a prediction before the run: take the shift the group shows on the items it *was* asked and apply it to the one it was not. It barely helps, 0.35 points (95% interval −0.74 to +0.01), and the rule we set for refuting the idea was met. The shifts are item-specific. Premarital sex, same-sex relations and cohabitation move together, and borrowing worked there. But abortion, divorce law and adultery run against that cluster, and borrowing made them worse.

What that means for a survey designer is that rotating an item off one group's ballot still needs a small calibration subsample of that group who are asked it. How small is the next question. One model and one seed; the full tables are in the [research log](/research/christian-belief-models/).
