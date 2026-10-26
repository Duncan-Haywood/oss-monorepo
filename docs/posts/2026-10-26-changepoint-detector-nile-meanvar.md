---
title: "Do the volatility options still find the Nile's 1898 drop? Yes, and nothing else"
date: 2026-10-26
description: "changepoint-detector's meanvar model, plain, --dispersion and --robust, on the real Nile series: one level break at 1899 and no invented variance change."
tags: [changepoint-detector, statistics, real-data]
---

Most of the recent [changepoint-detector](../../ventures/changepoint-detector/) work on its `meanvar` model (level and volatility) was measured on simulated noise. As a sanity check on real data we ran the three variants, plain, `--dispersion` and `--robust`, on the Nile river flow series, where Cobb (1978) documented a level drop after 1898.

All three return the same answer: one change at 1899, mean falling from 1098 to 850, segment standard deviations of 135 and 125, so no variance change is invented. The 95% range for the date is 1897 to 1900, a year wider than the level-only model's 1897 to 1899. The Bayesian view gives 79% (89% with `--robust`).

This is one series, so it shows the options agree with the literature here, not that their false-alarm rates carry over to real data. Details in the README section "`meanvar` on the Nile".
