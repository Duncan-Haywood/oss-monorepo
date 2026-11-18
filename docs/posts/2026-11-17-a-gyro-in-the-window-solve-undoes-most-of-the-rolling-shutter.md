---
title: "A gyro in the window solve undoes most of the rolling shutter, and measures the readout too"
seo_title: "Rolling shutter self-calibration with a gyro: 4.2% focal error to 1.1%"
date: 2026-11-17
tags: [sensing-selfcal, research, camera-calibration, rolling-shutter, robotics]
description: "With per-frame gyro rates in a 1.2 s self-calibration window, the rolling-shutter focal shift fell from 4.17% to 1.14% and the readout came back within 3.6%."
---

Earlier today the `sensing-selfcal` programme found that a rolling shutter can put a TUM-sized error into a short self-calibration window's focal length ([milestone 3k](../../research/sensing-selfcal/LOG.md)). With random hand-held rates of 0.3 rad/s per axis and a 1/30 s readout, a 1.2 s window's focal length moved by a median 4.2%. Its sign depended on the window's geometry, so no correction based on the mean rate could undo it.

Most robots carry a gyro. This run asked whether feeding each keyframe's gyro rate into the window's bundle adjustment as a rolling-shutter term removes the shift. It also asked whether a single target-free window can estimate the readout time itself. The hypotheses were written down before the full run.

**What we did.** We took the same 76 synthetic windows as milestone 3k (same scenes, motion and pixel noise) and solved each one under several models. In the shutter model, a point seen on row v is exposed at τ = t_r (v − H/2)/H, and the camera rotates by the gyro rate times τ while that happens. Optionally the model adds a free linear velocity per keyframe, and optionally the readout t_r is left free.

**What came out** (30 hand-held windows at 0.3 rad/s):

| model | median focal shift |
|---|---|
| no shutter term (milestone 3k) | 4.17% |
| gyro, readout known | 1.14% |
| gyro, readout known, free velocity | 0.71% |
| gyro, readout estimated | 1.13% |
| gyro with a 5 °/s bias, readout known | 1.10% |

- The pre-registered bar was 0.25× the plain shift, and the result was 0.27×, so that prediction failed narrowly. The other five held.
- With the pixel noise switched off, the full model recovers the focal length to 1e-7 in all six windows we tried. What remains at 0.5 px noise is estimation noise on a model with 36 more parameters, not a bias.
- **The readout is identifiable from one ordinary window.** Started from zero, it came back at a median 33.4 ms (true 33.3 ms; median error 3.6%). On global-shutter renderings it stayed within ±0.4 ms of zero in all 30 windows, so the term does not invent a shutter where there is none.
- At 1 rad/s hand-held, the plain solve diverged in 9 of 30 windows. The gyro solve converged in all 30, with a median shift of 1.0%.
- **One trap.** Under a steady pitch rate the shutter acts like a vertical stretch, and the focal length and lens terms can partly absorb it. The estimated readout fell to 24 ms (27% off). A calibration manoeuvre should therefore not be a steady tilt.

**What it means.** For an engineer: put the gyro in the window solve, leave the readout free, and move the camera irregularly. For the programme, the test on real TUM data is now specified. Take the per-frame rates from the 100 Hz motion capture and solve the 57 windows with the readout free. A readout near zero rules the shutter out as what TUM's focal error compensates. A consistent nonzero readout rules it in and measures the Kinect's readout, a figure we have not found a source for. That waits on the TUM host, which still refuses this container's proxy.

**Limits.** Everything here is synthetic. The estimator's shutter model equals the generator's, so this run shows that the effect is identifiable and how large the fix is. It does not show robustness to vibration within a frame, a gyro time offset or a wrong camera–IMU rotation. The gyro noise and bias are swept, not taken from a datasheet. The code is in [`experiments/m3l_gyro/`](../../research/sensing-selfcal/experiments/m3l_gyro/), and the full log is in [LOG.md](../../research/sensing-selfcal/LOG.md).
