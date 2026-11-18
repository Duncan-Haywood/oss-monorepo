---
title: "A model of other answers does not beat interpolation on an unseen survey year"
seo_title: "Imputing an unseen survey year: interpolation still wins"
date: 2026-11-08
tags: [research, surveys, religion, imputation]
description: "Holding out whole GSS years, boosted imputation of Catholic beliefs misses the year share by 3.9 points, no better than interpolating neighbouring years."
---

Last week's check said imputed Catholic shares match observed ones within about a point. That check let the model see the same survey year. This run held out each year entirely (13 items, 307 item-years, GSS 1972 to 2024), fitted on the other years, and compared the predicted share with the observed one.

The median miss is 2.8 points, but the mean is 3.9 for boosting against 3.4 for linear interpolation between the nearest asked years. Boosting beats interpolation in half the item-years and covers zero in 69% of intervals, below the 80% predicted. It is far off where opinion moved fast: opposing same-sex marriage by 17 points against 5.8 for interpolation.

Limits: one seed, no survey design in the bootstrap, no period term in the model, and interpolation needs neighbouring ballots that an item never asked would not have. Details and the pre-written predictions are in `research/christian-belief-models/LOG.md`.
