---
title: "A changepoint detector told West German unemployment had 24 regime changes"
seo_title: "Changepoint detection on a ramp: German unemployment 1962-1991"
date: 2026-11-05
tags: [changepoint, time-series, data, testing]
description: "Run on 30 years of West German unemployment, a mean changepoint model finds 24 steps; allowing for autocorrelation leaves 2. What that does and does not show."
---

West German unemployment, quarterly, 1962 to 1991, is a good test for a changepoint detector because it is not made of steps. It sits near 1% until 1973, climbs through the oil-shock recession of 1974-75 to about 4.5%, and climbs again through the 1980-82 recession to about 9%.

The [changepoint detector](../../ventures/changepoint-detector/README.md) (PELT with a BIC penalty, MIT licensed) reads a ramp as a staircase. On the seasonally adjusted series it returns 24 level changes, on the unadjusted one 10. With `--ar1`, which allows for lag-1 autocorrelation, it returns two: 1974Q3 (mean 1.05 to 4.33) and 1981Q4 (4.33 to 8.28).

Three things to take from it, none of them a claim about the economy:

- The two dates sit on the two recessions, but the rate had been rising for a year or more before each, so they mark the middle of a ramp, not a day something happened.
- `--ar1` is not free. It drops the real 1966-67 recession bump the default finds, and on the unadjusted column, giving the seasonal period as well (`--period 4 --ar1`) loses the 1974 step and keeps only 1981Q3.
- This is one series. It adds a second real case, after Gallup approval, of `--ar1` taming an over-cut at the price of a smaller real change.

The series is in the repository (`data/german-unemployment.csv`) with its source, and `german-unemployment.test.mjs` pins every number above. The data are AER's `GermanUnemployment` (Franses 1998). This is statistical analysis of public data, not economic advice.
