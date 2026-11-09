---
title: "Which fix for over-cut drifting series finds the step: a noise floor or joint AR(1)?"
seo_title: "Changepoint detection on drifting autocorrelated series: noise floor vs joint AR(1)"
date: 2026-11-09
tags: [changepoint-detector, simulation]
description: "On 60 seeded drifting series per cell, joint AR(1) finds a known step 60 of 60 times at phi 0.8, where plain AR(1) finds 27 and a noise floor leaves 3 false cuts."
---

A changepoint detector fed a smoothly drifting series with correlated noise
cuts it into a staircase. changepoint-detector has two remedies: a noise floor
(`--noise-floor k`) and an AR(1) error term (`--ar1`). Earlier runs compared
them at phi 0.5 only and never ran the exact-likelihood version, `--ar1 joint`.

This run did, on 60 seeded series of 120 points per cell: drift 0.2 per step,
one step of 4 noise sd, phi 0.2, 0.5 and 0.8.

At phi 0.8 and noise sd 1, plain `--ar1` found the step in 27 of 60 series.
`--ar1 joint` found it in 60 of 60, with 0.45 other cuts per series. The floor
at k=1.5 left 3.15 other cuts, and the unfloored model left 5.9. At phi 0.2 the
floor wins: 60 of 60 with 0.05 other cuts, against 1.4 for joint.

So strong autocorrelation points to `--ar1 joint`, weak to a floor near 1.5.
This is synthetic data with one step size, so nothing changes by default. A
real drifting series with a documented break is still the missing evidence.

Script, output and test: `ventures/changepoint-detector/eval/noise-floor-ar1-joint-sim.mjs`.
