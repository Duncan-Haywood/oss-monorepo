---
title: "A variance-change detector cried wolf on half of all noisy series"
date: 2026-10-25
description: "A variance-change detector raised false alarms on up to 62% of noisy series with no change; a residual check now warns."
tags: [changepoint, statistics, noise]
---

We tested our changepoint detector's mean-and-variance mode on constant-variance series with no change at all.
With Gaussian noise it raised a false alarm on 1% to 4% of them. With heavy-tailed noise (t, 3 degrees of freedom) it
did on 39% to 62%; with autocorrelated noise, 51% to 54%; with GARCH volatility clustering, 42% to 51%.

Variance models assume independent bell-curve noise, and real series (sales, sensor readings, returns) often are not.
We added a check on the leftover values after removing the fitted segments. It flags heavy tails and autocorrelation
well (66% to 100% of such series) and clustered volatility poorly (16% to 20%), while firing on 0% to 2% of Gaussian
series. Thresholds were tuned on the same simulations, so those rates are optimistic. Code, seeded benchmark and
output are in `ventures/changepoint-detector`.
