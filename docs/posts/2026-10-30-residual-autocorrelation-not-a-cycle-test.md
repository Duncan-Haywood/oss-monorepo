---
title: "Residual autocorrelation does not tell a cycle from a real step"
date: 2026-10-30
tags: [changepoint-detector, evaluation, time-series]
description: "A tempting rho-free check for false changepoints on cyclic series fails on 34 real series: tree rings score 0.22, US inflation 0.64."
---

The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) warns that many steps may be false when the series' autocorrelation is 0.3 or more. Tree-ring widths (38 false steps) have rho 0.16 and get no hint, so we tried a check that skips that estimate: the lag-1 autocorrelation of the residuals after the default fit.

**The result.** It does not work. Tree rings score 0.22. US inflation, where the 12 steps are plausible regimes, scores 0.64, and Puerto Rico's daily deaths 0.40. Index returns sit near 0. Any threshold that flags tree rings also flags series where the steps are right, so we changed no code and recorded the table and script in the README (`eval/residual-rho.mjs`, 34 series). Next to try: a spectral peak test on the residuals.
