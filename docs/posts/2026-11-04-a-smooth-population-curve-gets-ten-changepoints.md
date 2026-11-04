---
title: A smooth population curve gets ten changepoints
date: 2026-11-04
tags: [changepoint-detection, negative-result, time-series]
description: "Our changepoint detector found 10 to 43 changes in 89 quarters of smooth Australian population data where nothing broke. Why a low-noise curve fools it."
---

We ran our changepoint detector on 89 quarters of Australian resident population (1971 to 1993), in logs. Nothing documented broke in that curve. The trend model still reports 10 changes, the level-only model 43, and the autocorrelation-corrected one 9.

The reason is that the curve is almost noiseless. When the noise estimate is tiny, any bend in the growth rate clears the penalty. The tool does warn (a cycle warning on the trend run, a range warning on the level run), but the count itself is misleading.

This is a negative result and we have not fixed it. The data, script and pinned output are in `ventures/changepoint-detector` (`eval/austres.mjs`). The next idea is a noise floor tied to the series' own scale. If you run changepoint detection on smooth, accumulating series such as populations, balances or cumulative counts, treat the change count with suspicion.
