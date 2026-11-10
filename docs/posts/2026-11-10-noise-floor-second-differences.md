---
title: "A noise floor that ignores drift: second differences in the changepoint detector"
seo_title: "Changepoint detection on drifting series: a second-difference noise floor"
date: 2026-11-10
tags: [changepoint-detection, time-series, statistics, open-source]
description: "A first-difference noise floor loses a step smaller than the drift. A second-difference floor keeps it at every noise level in a seeded simulation. Numbers and caveats."
---

The changepoint detector over-cuts smooth, drifting series: a population count
or a CO2 curve has tiny scatter, so every bend looks significant. Its
`--noise-floor k` option sets sigma to at least `k` times the median absolute
step between neighbours. The flaw: when the drift per step exceeds the scatter,
that median is the drift, so the floor swamps real steps.

Second differences, `y[t] - 2y[t-1] + y[t-2]`, cancel a straight drift. The new
`--noise-floor-diff2` flag builds the floor from them, scaled so `k` means the
same thing on white noise.

Simulation (60 seeded series per cell, 120 points, drift 0.2 a step, AR(1)
noise at phi 0.5, one step of 4 noise sd, trend model). Share of series where
the step was found:

| noise sd | first-difference, k=1 | second-difference, k=2 |
|---|---|---|
| 1 | 59/60 | 60/60 |
| 0.3 | 59/60 | 59/60 |
| 0.1 | 60/60 | 60/60 |
| 0.03 | 0/60 | 60/60 |

Other cuts per series with the second-difference floor at k=2: 0.30, 0.37, 0.25
and 0.10. The first-difference floor's best k moves with the drift-to-noise
ratio; the second-difference one did not.

Limits: synthetic data only, one drift, phi fixed at 0.5. Not tried on real
series, at high phi, or with a curved drift. The option is off by default.

Reproduce: `node ventures/changepoint-detector/eval/noise-floor-diff2-sim.mjs`.
Details are in the venture README.
