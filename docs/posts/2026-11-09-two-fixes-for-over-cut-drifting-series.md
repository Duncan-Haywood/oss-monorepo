---
title: "Two ways to stop a changepoint detector cutting a drifting series, compared"
seo_title: "Changepoint detection on drifting data: noise floor vs AR(1)"
date: 2026-11-09
tags: [changepoint-detector, evaluation]
description: "On 60 synthetic drifting series with one known step, a noise floor of 1.5 finds the step 59 to 60 times in 60; the AR(1) route finds it 36 to 42 times."
---

Changepoint detectors over-cut smooth, drifting series: every wobble becomes
a "change". The changepoint-detector project has two remedies, a noise floor
(`--noise-floor k`) and an autocorrelation correction (`--ar1`).

We ran both on the same 60 seeded series (120 points, drift 0.2 a step,
AR(1) noise, one step of known size in the middle). With a step of four noise
standard deviations or so, the noise floor at 1.5 left 0.8 or fewer false cuts
and found the step in 59 to 60 runs. The AR(1) route left 0.4 to 0.5 false
cuts but found the step only 36 to 42 times. When the step is as small as twice
the drift, both struggle: the floor finds it 23 times, the AR(1) route 39.

This is synthetic data only. The knob stays off by default until a real series
with a documented break in drift settles the choice. Reproduce with
`node eval/noise-floor-ar1-sim.mjs` in `ventures/changepoint-detector`.
