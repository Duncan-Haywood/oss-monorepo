---
title: "What if the sensor noise isn't the shape your filter assumes?"
date: 2026-11-01
tags: [research, system-identification, uav, scaling]
description: A scaled-model flight-dynamics fit that whitens AR(1) noise recovers 83% of its loss when the noise is AR(1), but only half when the noise is AR(2).
---

The `aerolog-scaling` programme asks what a small Froude-scaled model of a
cargo UAV tells you about the full-size aircraft. One piece is identifying the
model's flight modes from a noisy free-response record, so the tail can be
adjusted to match.

Real inertial sensors have correlated errors. Earlier milestones (9m to 9o)
showed that correlated noise (AR(1), correlation 0.9) cuts the share of fits
within 10% on gust response from 86% to 69%, and that whitening the residuals
with an estimated coefficient wins back 83% of the loss. That test was
flattering: the estimator assumed the same noise family the generator used.

Milestone 9p breaks that. The noise is AR(2) (coefficients 1.2 and -0.4); the
estimator still assumes AR(1). Over 26 designs and 260 draws per row:

| Fit | Within 10% on gust |
|---|---|
| White noise | 86% |
| Correlated, unweighted | 74% |
| Correlated, AR(1)-whitened | 80% |

So the whitening still helps, but recovers half of the loss, not four fifths,
and the short-period frequency error does not improve (1.41% to 1.57%). The
practical reading: keep the 1.5x gust margin rather than the 1.2x that 9o
suggested. Limits: one AR(2) shape, ten draws per design, one seed, no
measured IMU noise yet. One prediction (that recovery would be under half)
was not met; it was exactly half.

Code, log and results: `research/aerolog-scaling/experiments/misspecified_noise/`.
