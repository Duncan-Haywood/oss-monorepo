---
title: "When fitting a sensor offset makes the answer worse"
seo_title: "Sensor drift in system identification: a constant-offset fit backfires"
date: 2026-11-02
tags: [research, aerolog-scaling, system-identification, imu]
description: "A simulated test of drift in a sub-scale aircraft's sensors: a fitted constant offset can be worse than none, a fitted slope fixes it."
---

The aerolog-scaling research programme asks whether a small flying model can stand in for a full-size cargo aircraft. Milestone 9w showed that a constant sensor offset hurts the fit that recovers the model's flight modes, and that four fitted offset parameters repair it. Milestone 9x asks what happens when the offset drifts during the record, as a warming IMU does.

In simulation (20 designs, 8 noise draws each, 10% white noise), a linear drift of 20% of a channel's rms raises the median short-period frequency error from 0.7% to 1.6% over one phugoid period. The constant-offset fit from 9w repairs none of it, and over two periods it is worse than no correction at all (2.1% against 0.9%). Adding a fitted slope brings the error back to 0.9% and 0.65%.

So the advice from 9w needs a caveat: fit a slope with the offset, or neither. Limits: a linear ramp only, sizes chosen as fractions of rms rather than from a measured sensor, a fifth of the designs, one seed. Details are in `research/aerolog-scaling/LOG.md`.
