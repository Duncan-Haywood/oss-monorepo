---
title: "Orange juice freezes: a changepoint test with a known cause"
seo_title: "Changepoint detection on orange juice prices: freezes as ground truth"
date: 2026-11-05
tags: [changepoint, time-series, data]
description: "Fifty years of Florida orange-juice prices, with a measured freeze count each month, show the trade-off in changepoint detection: find every shock or stop over-cutting."
---

Most changepoint demos check a detector against a break somebody wrote down in a history book. Orange juice prices come with something better: the number of freezing degree days in Orlando for every month from 1950 to 2000. Eight months have 19 or more, and those are the frosts that hurt the crop.

I ran the [changepoint detector](../../ventures/changepoint-detector/README.md) on the real, deflated price (612 months, Stock and Watson's `FrozenJuice` data) and counted how many of the eight freezes it found within two months.

| Setup | Changes reported | Big freezes found (of 8) |
|---|---|---|
| default mean model | 148 | 8 |
| mean model with an AR(1) noise term | 10 | 3 |
| mean and variance | 32 | 5 |

The default finds every freeze, but only 13 of its 148 changes sit near one. Allowing for autocorrelation cleans the answer up to 10 changes and drops five real frosts. Neither is wrong; the series is a run of shocks that decay, and a model of steps cannot say both "this is a shock" and "this is noise". That is now a measured case in the project's open problems, with the data, script and test in the repository.

Caveat: freezing degree days are a good truth but not a perfect one. A frost's price effect depends on the crop and lags, so 13 of 148 is a ceiling on precision, not a rate.
