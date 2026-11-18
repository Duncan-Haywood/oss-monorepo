---
title: "TUM's image stamps run 5 ms behind the motion, and the camera's translation does not bend its focal length"
seo_title: "TUM RGB-D: a 5 ms camera-mocap offset and velocity in self-calibration"
date: 2026-11-18
tags: [sensing-selfcal, research, camera-calibration, rolling-shutter, tum-rgbd, robotics]
description: "On 53 real TUM windows, motion-capture velocity fits the images but leaves the focal error unchanged; the camera-mocap offset is a steady 5 ms."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from 1.2 seconds of ordinary video, with no checkerboard. Earlier today it found that TUM's RGB-D cameras have a rolling shutter. Putting a shutter term, driven by the motion-capture rotation, into each window's solve removed a third to a half of the focal-length error ([milestone 3n](2026-11-18-tum-cameras-have-a-rolling-shutter-and-it-was-in-the-focal-length.md)). A median error of 1.9% to 4.0% was left. This run tested two suspects for that remainder, on the same real video.

**The suspects.** The first is the camera's *translation* during the readout. The shutter term so far only modelled the rotation. A synthetic test this morning found that leaving translation out biases a time-offset estimate by about 3 ms. The second is a *timing offset* between the motion capture's clock and the camera's. If the rotation we feed in is a few milliseconds stale, the solve may bend the focal length to make up for it.

**What we did.** We used milestone 3n's 53 counted windows from three TUM sequences: fr1/desk and fr1/xyz (a Kinect) and fr3/structure_texture_far (an Xtion). Each window has 12 keyframes over 1.2 s and its own SIFT tracks. We solved each window five ways, all with the readout time free:

- **est:** the shutter term, rotation only (milestone 3n's model).
- **est_mu:** plus the linear velocity from motion capture, entered as a known input. Its scale comes from comparing the window's camera centres with the mocap centres.
- **mu_shuf:** the velocity of a different window, as a null.
- **est_d:** rotation only, with the mocap–camera time offset free.
- **est_mud:** velocity and offset together.

The six predictions were committed before any TUM solve ran ([LOG](../../research/sensing-selfcal/LOG.md)).

**What came out.**

| model (Kinect, 30 windows) | median focal error | cost below est |
|---|---|---|
| est | 2.62% | n/a |
| est_mu | 2.14% | 26 of 30 |
| mu_shuf | 2.80% | n/a |
| est_mud | 2.48% | 28 of 30 |

The velocity is real signal. The true velocity fits better than none in 26 of 30 Kinect windows, and better than another window's velocity in 23 of 28. On the Xtion it fits better in 17 of 23 windows, just short of the 75% bar we set.

But it does not change the focal length. The drop in the median (2.62% to 2.14%) passed the prediction as written. The paired view says otherwise: the error fell in only 15 of the 30 windows, and a Wilcoxon signed-rank test gives p = 0.45. Over all 53 windows the median paired change is 0.05 percentage points, in the wrong direction. A few windows swapping places around the median made the medians move. We set the prediction on medians, and the paired test should have been set in advance; the log records both.

The offset is real, though. With the offset free, the window finds that **the camera's image stamps run a median 5.1 ms behind the motion they show**. That is 6.0 ms on fr1/desk, 5.4 ms on fr1/xyz and 4.0 ms on fr3. The estimate is positive in 46 of the 53 windows (sign test p = 4×10⁻⁸). Unlike the synthetic case, it does not depend on modelling the velocity: the two estimates differ by a median 0.55 ms. Freeing the offset moves the focal length by about 0.5%, but not consistently toward the right answer: the error falls in 30 of 53 windows.

**The catch.** Each window's offset scatters by 3 to 5 ms across windows, while the solver claims 0.2 to 0.7 ms. That is the same overconfidence this programme has found for the focal length and the readout. One window tells you the offset to a few milliseconds. Its own error bar says much better, and it is wrong.

**What it means.** The focal error left after the shutter term on TUM is not a timing effect. Translation and clock offset are both in the data and both can be measured, but neither is what the short window's focal length was compensating. For anyone self-calibrating on TUM-class RGB-D data with motion capture: enter a +5 ms image-stamp offset, skip the velocity in short windows, and treat any single window's offset as good to about 3 to 5 ms. The next step goes back to geometry. Earlier milestones found that the spread of view angles in a window predicts its error, and this run points back to that.

**Limits.** The data is three sequences from two sensor units. The velocity's scale comes from each window's own starting solution. The offset is measured against TUM's mocap stamps after TUM's own synchronisation, so it is not a hardware latency. The focal reference is a 13-view board calibration.

Code, data and every number: [`research/sensing-selfcal`](../../research/sensing-selfcal/) (experiment `m3p_tumvel`). The TUM RGB-D benchmark is by Sturm et al. (IROS 2012), CC BY 4.0.
