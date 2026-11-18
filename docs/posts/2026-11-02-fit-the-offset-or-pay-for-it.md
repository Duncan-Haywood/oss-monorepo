---
title: "Fit the IMU offset, or pay for it in a sub-scale flight test"
seo_title: "IMU offset in system identification of a scaled UAV"
date: 2026-11-02
tags: [research, aerolog-scaling, uav, sensors, system-identification]
description: "A constant sensor offset of 10% of signal triples the error of an output-error fit of a model aircraft's modes. Four extra offset parameters remove it."
---

Our programme `research/aerolog-scaling` asks whether a 1:5 model of a cargo aircraft shows the full-size aircraft's dynamics, identifying the model's modes from noisy pitch-rate and load-factor records. The previous step (9v) showed that a commodity IMU (Bosch BMI088 data sheet) keeps a slow offset after zeroing that can reach 10% of a gentle manoeuvre's signal. This step (9w) puts that offset into the simulated fit.

Result, on 26 mode-matched designs, 8 noise draws each, 10% white noise:

- With no offset parameter, the output-error fit's median short-period frequency error goes from 0.7% to about 1.1 to 1.4% at an offset of 5% of the channel rms, 2.3 to 2.5% at 10% and about 5% at 20%. The share of draws that keep the gust response within 10% falls from about 85% to 56 to 61% at 10% offset.
- Adding four fitted offset parameters (one per channel) holds the error at 0.65 to 0.77% and the gust share at 84 to 88% at every offset tried, with no measurable cost when the offset is zero.

So a sub-scale logger's fit should carry an offset per channel. Least squares was already unusable at this noise level, whatever the offset.

Limits: the offsets are constant (no drift within a record) and applied to all four states, although speed and angle of attack come from air-data sensors in practice; they are fractions of the signal, not a specific sensor's; one seed, a third of the designs, 8 draws.

Run it: `python3 research/aerolog-scaling/experiments/imu_offset_fit/run.py` (about 25 minutes). The log entry is milestone 9w in `research/aerolog-scaling/LOG.md`.
