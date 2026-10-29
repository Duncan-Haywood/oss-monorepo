---
title: "Does a seasonal-drift warning cry wolf on a clean series?"
date: 2026-10-29
tags: [changepoint-detector, statistics]
description: "We tested the changepoint detector's drift warning on 195 synthetic months with no shock. It stays quiet on white noise and fires on autocorrelation alone."
---

The free changepoint detector warns when several steps pack into two seasonal cycles, because that usually means a seasonal shape that is changing and not a run of regime changes. On a real 195-month euro factory-orders series it fired, but with no same-length series free of events there was nothing to compare it to.

We built one: 195 synthetic months with a fixed seasonal shape, a slow rise and Gaussian noise, 40 seeds per setting. With a trend term and white noise the warning fires in at most 3 of 40 runs. Without a trend term the rise is read as steps, and the warning fires anywhere from almost never to every time depending on the noise level. With mildly autocorrelated noise (rho 0.5) it fires in 30 to 35 of 40 runs even with the trend modelled and no event at all.

So the warning is not evidence of a shock or a changing shape on its own: autocorrelation triggers it. The next step is pointing its text at the `--ar1` option. This is synthetic only; the numbers and the script are in the project README.
