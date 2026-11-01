---
title: "Correlated sensor noise quietly skews a flight-test fit, and a cheap fix"
date: 2026-11-01
tags: [research, aerolog-scaling, system-identification, uav]
description: Simulated flight-test fits of a scaled aircraft, with AR(1) sensor noise: the fit converges to slightly wrong modes, and an iterated GLS fit recovers most of the loss.
---

In the `aerolog-scaling` programme we fit a model's longitudinal modes from a
noisy simulated doublet, to choose an in-flight tail correction. Earlier
results used white noise. Real IMU errors are correlated in time.

With AR(1) noise (rho 0.9, same rms, 260 simulated draws over 26 designs) the
fit did not fail: it converged, to slightly wrong modes. Short-period frequency
error doubled (0.67% to 1.51%) and the share of draws that predicted the gust
response within 10% fell from 86% to 69%.

Whitening the residuals with rho known recovered 14 of the 17 points. Estimating
rho from the residuals (two GLS iterations, median estimate 0.878 against a true
0.9) cost nothing measurable: 83% either way. A practical rule: allow about 1.5x
margin on gust error with an unweighted fit, about 1.2x with iterated GLS.

Caveats: the estimator's AR(1) form matches the generator, which flatters it; one
seed; real IMU noise density is untried. Numbers and code are in
`research/aerolog-scaling/` (log entries 9m to 9o, paper Section 4.10a).
