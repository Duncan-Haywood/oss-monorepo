---
title: "A spectral peak test did not detect cycles in changepoint output either"
date: 2026-10-30
tags: [changepoint-detector, evaluation, time-series]
description: "We tried Fisher's periodogram test on the residuals of 34 real series as a way to warn about false changepoints from cycles. It found lynx and sunspots, missed lh, and flagged tree rings for the wrong reason."
---

The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) reports 38 false steps on 7,980 tree rings and has no warning for it, because the lag-1 autocorrelation is only 0.16. After residual autocorrelation failed as a rho-free check, we tried the next candidate: Fisher's g test on the periodogram of the residuals after the default fit.

**The numbers.** On 34 series it finds the periods it should: lynx at 9.5 and sunspots at 11.1 (p about 2e-16), monthly deaths and temperatures at 12. It misses `lh` (p 0.12, 5 false steps). It flags tree rings (p 4e-5) only at a period of 1,596 points, the lowest frequencies, which is drift, not a cycle. Nile, Lake Huron and US inflation also peak at period equal to the series length, a real regime or slow drift the test cannot tell from a slow cycle.

**Result.** No code changed; the detector keeps its block-variance warning. The script, output and table are in `ventures/changepoint-detector/eval/` and the README. What is still missing is a documented series with many real steps to calibrate any hint against.
