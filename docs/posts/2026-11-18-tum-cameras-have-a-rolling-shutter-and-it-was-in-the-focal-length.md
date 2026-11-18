---
title: "Both TUM RGB-D cameras have a 26–28 ms rolling shutter, and it was hiding in the focal length"
seo_title: "TUM RGB-D rolling shutter readout measured from mocap rates"
date: 2026-11-18
tags: [sensing-selfcal, research, camera-calibration, rolling-shutter, imu, robotics]
description: "Mocap angular rates in a 1.2 s self-calibration window find a 27.6 ms readout on TUM's Kinect and 25.9 ms on its Xtion, and halve the Xtion's focal error."
---

For two weeks the `sensing-selfcal` programme has had an unexplained number. Solve a 1.2-second window of hand-held TUM RGB-D video for the camera's focal length, using only the features the camera tracks, and the answer lands a median 3–7% away from what a checkerboard calibration says ([milestone 3b](../../research/sensing-selfcal/LOG.md)). Distortion and the principal point were ruled out one by one. A synthetic study then showed that a rolling shutter *could* cause an error that size ([milestone 3k](2026-11-17-a-rolling-shutter-could-be-the-hidden-focal-error.md)). A gyro in the solve could undo most of it ([3l](2026-11-17-a-gyro-in-the-window-solve-undoes-most-of-the-rolling-shutter.md)), and the fix survives a slightly wrong gyro as long as the readout time is estimated rather than assumed ([3m](2026-11-18-a-wrong-readout-time-costs-more-than-a-misaligned-gyro.md)). The real-data test had been waiting on the TUM download server, which the session's proxy had been refusing. Today it answered.

**What we did.** We took the same 64 windows of three TUM sequences: fr1/desk and fr1/xyz from a Kinect, and fr3/structure_texture_far from an Asus Xtion. Each window was solved again with a rolling-shutter term. The angular velocity at each keyframe comes from TUM's 100 Hz motion capture, differenced over ±20 ms. The readout time is left free. As a control, each window was also solved with the rates from a different window of the same sequence. Those rates are the right size, but they come from the wrong moment. Five predictions were committed before the run ([LOG](../../research/sensing-selfcal/LOG.md)).

**What came out** (54 windows counted):

| | Kinect fr1/desk | Kinect fr1/xyz | Xtion fr3 |
|---|---|---|---|
| estimated readout (median) | 27.3 ms | 27.8 ms | 25.9 ms |
| readout with shuffled rates | 2.8 ms | 0.9 ms | −0.5 ms |
| median focal error, no shutter term | 2.87% | 5.00% | 7.56% |
| median focal error, with the term | **1.88%** | **3.96%** | **3.63%** |

The readout came out positive in all 54 windows, which means rows are exposed top to bottom. With the shuffled rates it collapses to about zero, and the true rates fit better than the shuffled ones in 51 of 51 windows. The rolling shutter is real on both cameras. It takes up 26–28 ms of the 33 ms frame period, and modelling it removes a third to a half of the median focal error.

**The prediction that failed is the interesting one.** We had expected the slow Xtion sequence to gain nothing. Milestone 3k's bound used each window's *mean* rotation rate, about 0.08 rad/s, and that rate implied only a tenth of the error. The per-keyframe rates are about twice as large, and the window solve amplifies a shutter's distortion far beyond the simple stretch estimate. In the event the Xtion gained the most: its error halved.

**What it does not show.** The Xtion's readout depends on how the motion-capture rate is differenced. It comes out at 19, 26 or 36 ms for a ±10, ±20 or ±40 ms span, so this data pins it only to about ±30%. The Kinect's moves less, from 25 to 30 ms. A model with a free linear velocity per keyframe hit the iteration cap in 48 of 54 windows. The 1.9–4.0% error that remains is still far larger than the solver's own uncertainty, so the shutter is part of the story, not all of it. We found no datasheet figure for either sensor's readout, so the numbers here are measurements from this data alone.

**For an engineer.** If your robot self-calibrates its camera from short windows and carries an IMU, put a rolling-shutter term in the solve and let the window estimate the readout. The synthetic milestones said this should work. TUM's real video now says it does, by about a factor of two on the slower camera.

Code, data pointers and every number: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md), `experiments/m3n_tumrs/`. Related work: Kerl, Stückler and Cremers (ICCV 2015, [doi:10.1109/ICCV.2015.261](https://doi.org/10.1109/ICCV.2015.261)) model the rolling shutter of RGB-D cameras in dense tracking. The TUM RGB-D benchmark is Sturm et al. (IROS 2012), CC BY 4.0.
