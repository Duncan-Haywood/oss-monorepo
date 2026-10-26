---
title: "Finding the UK seat-belt law in 192 months of road casualties"
date: 2026-10-26
description: "The changepoint detector dates a documented 1983 drop in British driver casualties to the right month, and shows why count data needs the overdispersion option."
tags: [changepoint-detector, statistics, real-data]
---

[changepoint-detector](../../ventures/changepoint-detector/) had been checked on simulated counts and on real quarterly GDP, but not on a real count series with a documented break. The UK front-seat belt law took effect on 31 January 1983 (Harvey and Durbin 1986), and R's `UKDriverDeaths` holds 192 monthly totals of drivers killed or seriously injured, 1969 to 1984.

With seasonal negative-binomial counts the detector returns 8 changes. One is 1983-01, from about 1600 a month to 1329, with a 95% range of 1983-01 to 1983-02, which holds the first full month under the law. Another is the winter-1973 dip. Plain Poisson on the same data returns 33 changes, because the months are clumpier than a Poisson allows. That is the case for `--overdispersion nb`.

One series and one break shows the range is plausible on real data. It does not show calibration; the seeded simulations do that. Script, test and data source are in the venture's `eval/` and `data/SOURCE.md`. Statistical analysis, not advice.
