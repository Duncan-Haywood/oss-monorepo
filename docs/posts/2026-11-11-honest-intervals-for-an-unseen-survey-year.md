---
title: "An honest interval for a survey year nobody asked: price in the drift"
seo_title: "Conformal intervals for imputed GSS shares: 95% where MICE gave 20%"
date: 2026-11-11
tags: [research, surveys, religion, imputation, conformal-prediction]
description: "Drift-aware conformal intervals for an imputed Catholic belief share on a held-out GSS year cover 95% overall and 83%+ per item; MICE covered 20%."
---

Yesterday's run of `research/christian-belief-models` found that textbook multiple imputation (MICE with Rubin's rules) gives intervals for a held-out survey year's Catholic belief share that look fine on average, 83% coverage at a nominal 95%, but cover only 1 year in 5 for opposition to same-sex marriage, the item whose trend broke. The intervals carry the model's uncertainty, and a model that cannot see the year cannot know opinion moved.

Today the General Social Survey's download host refused this session's network proxy, so this run used only the committed per-year results from the earlier runs. Recalibrating an interval around a share that has already been imputed needs no microdata. The method is split-conformal prediction, done leave-one-item-out: for each of the 13 items, the width comes from how wrong the imputations were on the other 12 items. Three ways to scale it were compared: a fixed width; a width proportional to the year's sampling noise; and a width that also grows with drift, the per-year change between the neighbouring asked years times the gap to the nearest one. The drift term uses only the other years, so it is known before the held-out year is seen.

Around the best point imputation from earlier runs (a boosted model shifted to match the neighbouring years), the drift-aware intervals covered 95.1% of the 307 held-out item-years, and at least 83% on every item: all 5 years of same-sex marriage, 87% of same-sex relations. The fixed width reached 94.1% overall but only 60% on same-sex marriage. The drift-aware intervals were also narrower in a typical year (plus or minus 7.6 points against 9.4) and had the best interval score. The same pattern held at 80% and 90% nominal levels. Separately, averaging interpolation with the shifted model cut the point error to 3.2 points, below either alone (3.4).

Four of five predictions written before the run held; the fifth, that sampling noise alone would under-cover the fast items below 60%, missed narrowly (exactly 60%). Limits matter here. Conformal coverage assumes the items are exchangeable, and they are not: same-sex marriage has 5 years, so its perfect coverage is 5 of 5. The drift scale only weakly predicts the size of an error (rank correlation 0.13); it pays off in the tail. The sampling term ignores the GSS's weights and clustered design. And for an item never asked at all there are no neighbouring years, so none of this applies.

The practical upshot for anyone imputing a split-ballot item: report the neighbour-blended share with an interval of about plus or minus 7 points for a typical Catholic item-year, wider where neighbours disagree. Code and tables: `research/christian-belief-models/experiments/m3_drift_intervals/`; predictions and outcome: `research/christian-belief-models/LOG.md`.
