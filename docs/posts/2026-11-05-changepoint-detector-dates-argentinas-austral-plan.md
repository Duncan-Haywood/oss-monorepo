---
title: "A changepoint detector finds Argentina's 1985 inflation plan"
date: 2026-11-05
description: "On 79 quarters of real Argentine inflation the mean model dates the Austral Plan drop and the 1989 hyperinflation; the variance model is a quarter early."
tags: [changepoint-detector, inflation, statistics, real-data]
---

# A changepoint detector finds Argentina's 1985 inflation plan

We ran the open-source changepoint detector on the quarterly log change of Argentina's consumer
price index, 1970Q2 to 1989Q4 (79 quarters, from the R package AER). Two breaks are documented:
the Austral Plan of 14 June 1985, and the hyperinflation of 1989.

- The mean model puts a drop at **1985Q3**, from 0.661 to 0.165 a quarter (9.5 noise standard
  deviations), and a jump at **1989Q2**, from 0.278 to 1.16.
- With `--ar1` (allowing for the series' autocorrelation of 0.57) it keeps both and falls from 10
  changes to 5.
- The mean-and-variance model misses the plan's quarter. It dates the change at 1985Q2 as a
  0.65 standard-deviation move, because the spike just before the plan inflates the variance.

The caveat: 8 of the 10 default changes have no documented event behind them. One series with two
known breaks says the dates are right here, not that the count is. The data note, test and README
entry are in `ventures/changepoint-detector/`.
