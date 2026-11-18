---
title: "A free gyro time offset fixes the focal length, but the offset it reports is 3 ms off"
seo_title: "Estimating gyro-camera time offset in a rolling-shutter window"
date: 2026-11-18
tags: [sensing-selfcal, research, camera-calibration, rolling-shutter, imu, robotics]
description: "In a 1.2 s self-calibration window, a free gyro-camera offset cuts a late gyro's focal error from 0.81% to 0.05%, but the offset absorbs unmodelled translation."
---

This morning the `sensing-selfcal` programme found that both TUM RGB-D cameras have a 26–28 ms rolling shutter, and that modelling it with motion-capture rates removes a third to a half of the focal-length error in a 1.2-second self-calibration window ([milestone 3n](2026-11-18-tum-cameras-have-a-rolling-shutter-and-it-was-in-the-focal-length.md)). The next unknown on that data is timing. The mocap and the camera have their own clocks, and a rate taken from the wrong moment is a wrong rate. So the question for this step was: can the same window estimate the gyro–camera time offset as well, without a separate calibration?

The TUM download server refused this session's proxy again, so the estimator was built and tested on synthetic windows first. That is the version the TUM run will use.

**What we did.** We took milestone 3m's 30 synthetic hand-held windows: 12 keyframes over 1.2 s, a 1/30 s rolling shutter, angular velocity a smooth random signal of about 0.3 rad/s per axis. The gyro is now a 200 Hz stream with realistic noise, shifted by −10, 0, 5, 10 or 20 ms. The solver reads each keyframe's rate at its own guess of the offset, and that guess is one more unknown in the bundle adjustment. Six predictions were committed before the run ([LOG](../../research/sensing-selfcal/LOG.md)).

**What came out** (all 630 solves converged):

| | offset fixed at 0 | offset free |
|---|---|---|
| focal shift from a 20 ms late gyro (median) | 0.81% | **0.05%** |
| focal shift from a 10 ms late gyro | 0.34% | 0.04% |
| readout estimate at 20 ms (true 33.3 ms) | 31.7 ms | 33.0 ms |
| focal error with no offset at all | 1.78% | 1.76% |
| error of the offset estimate (median, 10 ms late) | | **3.2 ms** |
| what the solver says that error is | | 0.46 ms |

The first three rows are the good news. Freeing the offset removes the focal error that a late gyro causes, keeps the readout honest, and costs nothing when the clocks were already in sync. The readout and the offset do not trade off: their correlation in the solver is about −0.02.

The last two rows are the surprise. The offset itself is off by about 3 ms, and the solver claims a tenth of that. Two of the six predictions failed on it.

**Why.** A follow-up check, run after the scoring, switched things off one at a time on 12 windows. With no pixel noise and no gyro noise the error was still 3.0 ms, so it is not noise. With the camera's linear velocity removed from the simulated motion it fell to 0.00 ms. The model assumes the camera does not translate during a frame's readout. When it does, the rows smear, and the offset is the parameter that can bend to imitate that smear. Solving for a velocity per keyframe brings the error down to 0.49 ms, and the solver's claimed sd (0.66 ms) becomes about right.

**What it means for a robot.** If your camera is rolling-shutter and you fuse it with an IMU, a free time offset in a short self-calibration window is a cheap safety margin for the focal length. Do not log the value as your rig's clock offset unless the window also models translation. On TUM that is the hard part: the free-velocity model did not converge there in milestone 3n. Making it converge is now the step that turns the offset into a real timing calibration.

**Limits.** These are synthetic windows. The motion model is a 0.5–3 Hz random signal at one rate level, with no feature tracker and no outliers. The diagnosis used 12 windows at one offset.

Code, data and the full log: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md), milestone 3o.
