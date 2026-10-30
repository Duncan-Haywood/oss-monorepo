---
title: "Changepoint Detector: a checkbox for heavy-tailed noise"
date: 2026-10-25
description: "The robust Laplace cost for volatility changes, measured in the command line last week, is now a checkbox on the page."
tags: [changepoint-detector, time-series]
---

[Changepoint Detector](../../ventures/changepoint-detector/) can look for a
change in a series' level and volatility. On heavy-tailed noise (t with 3
degrees of freedom) the Gaussian version reported a break 37 to 63% of the time
when none existed. The `--robust` Laplace cost cut that to 5 to 8%, at a price:
on clean Gaussian data with 100 points it found 57% of real breaks against 94%.

Until now only the command line could switch it on. The page has a checkbox for
it, shown with that trade-off in its label, and it only applies when the model is
"Level and volatility". Still open: a cost that copes with GARCH-style noise,
where Laplace still leaves 21 to 29% false alarms, and the Bayesian view.
