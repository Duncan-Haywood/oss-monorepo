---
title: "A wrong readout time costs a self-calibrating camera more than a misaligned or late gyro"
seo_title: "Gyro faults in rolling-shutter self-calibration: what matters"
date: 2026-11-18
tags: [sensing-selfcal, research, camera-calibration, rolling-shutter, imu, robotics]
description: "A 10° camera-IMU rotation adds 0.42% to a window's focal error and a 10 ms lag 0.35%, but a readout 5% off adds 1.23%, always the same way."
---

Yesterday the `sensing-selfcal` programme found that a robot can undo most of a rolling shutter's damage to a short self-calibration window by feeding its gyro into the solve ([milestone 3l](2026-11-17-a-gyro-in-the-window-solve-undoes-most-of-the-rolling-shutter.md)). The median focal-length error fell from 4.17% to 1.14%. That test gave the estimator a gyro that was exactly right, apart from noise and a constant bias. Real camera–IMU rigs get the gyro wrong in three ways. The gyro can be rotated slightly relative to the camera. Its scale can be off by a few percent. Its clock can run a few milliseconds ahead of or behind the camera's. This run asked which of those faults matters.

**What we did.** We used the same 30 synthetic hand-held windows as before: 12 keyframes over 1.2 s, random rates of 0.3 rad/s per axis, a 1/30 s readout and 0.5 px pixel noise. Each window was solved again with a faulty gyro, and its focal length was compared with the solve of the same window using an exact gyro. Pairing the solves this way cancels the window's own noise, so what remains is the fault's effect. The fault sizes are swept, not taken from a datasheet. The predictions were committed before the full run ([LOG](../../research/sensing-selfcal/LOG.md)).

**What came out** (median added focal error, readout held at its true value):

| fault | added error |
|---|---|
| camera–IMU rotation 1° / 3° / 10° | 0.04% / 0.15% / 0.42% |
| time offset 5 ms / 10 ms / 20 ms | 0.14% / 0.35% / 0.83% |
| gyro scale (or readout) 2% / 5% high | 0.50% / **1.23%** |

- **The readout is the fault to worry about.** A rolling-shutter model only ever sees the product of rotation rate and readout time. A gyro that reads 5% high is therefore the same as a readout taken 5% too long, for example from a spec sheet. It added 1.23% to the focal error, and in all 30 windows it pushed the focal length the same way, down. Averaging many windows will not remove an error that always points the same way. We had predicted 0.05–0.4%, so that prediction failed. We have not yet worked out why the sign never changes, and we only tested errors on the high side.
- **Leaving the readout free fixes it exactly.** With the readout estimated in the window, the scale error was absorbed to one part in a billion, and the readout estimate shrank by exactly the scale factor.
- **Alignment and timing are forgiving.** A 3° rotation or a 5 ms offset added under 0.15%, well below the 1.1% the window's own noise leaves. Even 10° or 20 ms stayed under 1%. A free readout also took a third off the 10° misalignment's error (0.29%). We had predicted it would not help, so that prediction failed too. Four of six predictions held.

**What it means.** If you are building a robot that recalibrates its camera on the move, estimate the readout time inside the window instead of importing it. Align the gyro to within a few degrees and keep its timestamps within 10 ms of the camera's. The real-data test on the TUM RGB-D sequences is still waiting, because their host refuses this container's proxy. That test uses motion-capture rates, and this result says they do not need to be perfectly aligned or synced, as long as the readout is left free.

**Limits.** Everything here is synthetic. The scene and path models are milestone 3k's, with no feature tracker and no outliers. The rotation rate is held constant over each frame's readout, and only one rate level was tested. The faults were tolerated, not estimated, and the frequency band of the smooth paths used for the timing test was chosen, not measured. The code is in [`experiments/m3m_gyrofault/`](../../research/sensing-selfcal/experiments/m3m_gyrofault/).
