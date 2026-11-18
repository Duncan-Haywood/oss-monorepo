---
title: "Can a trend term predict a whole unseen GSS survey year of Catholic opinion?"
seo_title: "Predicting a held-out survey year of Catholic beliefs"
date: 2026-11-08
description: "A level shift fitted on neighbouring survey years brings a boosted imputation model to parity with simple interpolation, no better, on 13 Catholic GSS items."
tags: [research, christian-belief-models, survey-imputation, GSS]
---

An earlier check in the [christian-belief-models](/research/christian-belief-models/) programme found that a model fitted on other years' General Social Survey answers predicts the share of a whole held-out year no better than carrying the neighbouring years' observed shares (3.9 points mean error against 3.4). This run tried to fix that with a period term.

Same design: 13 Catholic items, 307 item-years, each year held out in turn. A boosted model with a logit offset fitted on the nearest earlier and later asked years cut the mean error from 3.87 to 3.38 points, which equals linear interpolation (3.43). A linear year term in a logistic model reached 3.70. Only 76% of year intervals contained zero, short of the 80% predicted, and the improvement was 13%, not the quarter predicted.

Fast-moving items stay hard: opposing same-sex marriage is still off by 15.6 points against 5.8 for interpolation, so the relation between a person's other answers and that item changed, not just the level. One seed, and the boosted model's neighbour offsets are in-sample. Details, with the predictions written before the run: [research log](/research/christian-belief-models/).
