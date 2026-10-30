---
title: "A check that did not work: residual autocorrelation and false changepoints"
date: 2026-10-30
tags: [changepoint-detector, evaluation, negative-result]
description: "We tried to flag false changepoints from the residuals' lag-1 autocorrelation; Nile's real step and treering's 38 false ones score the same."
---

The changepoint detector warns about likely false steps when raw lag-1 autocorrelation is 0.3 or more. Tree-ring widths (rho 0.16, 38 false steps) get no warning, so we tried a check that does not use rho: the lag-1 autocorrelation of residuals after the default fit.

It does not work. The Nile series, with one documented step, scores 0.16. Treering scores 0.17. Lynx is -0.16, sunspots 0.16, and white noise sits near -0.02. The fitted steps absorb the slow structure, so residuals look like noise whether the steps were real or not.

We did not ship it. The numbers, script and test are in the changepoint-detector README; a check on the step list itself (alternating signs, segment lengths against a periodogram peak) is the next thing to try.
