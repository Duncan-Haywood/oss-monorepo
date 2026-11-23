---
title: "Robot camera self-calibration: a lens distortion off by 50% still beats re-learning it from video"
seo_title: "Self-calibration: a wrong held distortion beats re-learning it"
date: 2026-11-23
tags: [sensing-selfcal, research, camera-calibration, robotics]
description: "On real TUM video, a held lens distortion off by 50% moves rays 1.5 px inside 250 px, less than adopting the self-calibrated distortion. Keep it."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from the video it already records, and when it should trust the result. The [last step](2026-11-23-camera-self-calibration-keep-the-distortion.md) gave practical advice: when the camera's focal length drifts, re-learn the **focal length** from short windows of video, behind a gate that ignores changes smaller than half the estimate's own standard deviation, and keep the **lens distortion** from the last checkerboard calibration.

That advice had a hole, and the step said so. It assumed the distortion the robot holds is right. If the held distortion is itself wrong, then adopting the distortion re-learned from video, together with the new focal length, is the update that ought to pay. This run tested that case. The predictions were committed before the script was written.

**The test.** No video was re-solved. The TUM dataset host still refuses this cloud session, so the run reused 43 saved solves from three TUM RGB-D sequences on two cameras (a Kinect and an Xtion), pooled five windows at a time. Each camera has three real calibrations: a checkerboard fit, TUM's published one and a target-free bundle-adjustment anchor. Each was taken as the truth in turn. The robot's held model was given the truth's focal length, made stale by 0 to 10%, and a distortion taken from:

- **another real calibration** of the same camera (six truth and held pairs);
- **the truth itself** (the previous step's setting, as a control);
- **the checkerboard's own coefficients scaled** by &minus;50% to +50%.

Six update rules were scored by where rays land: the rms error in projected radius over 50 to 250 px from the image centre, and the worst-case regret across the staleness range. The sixth rule is new. It adds a second gate that adopts the re-learned distortion only when its predicted displacement at 200 px differs from the held one by more than half its standard deviation.

**What came out.**

- **A distortion borrowed from another calibration barely moves a ray.** Inside 250 px the three real calibrations of each camera agree on where rays land to within **0.2 to 0.5 px**. Even the checkerboard's coefficients off by **50%** cost only **1.5 px**.
- **The re-learned distortion is worse than either.** Adopting the windows' focal length and distortion together leaves **2.1 px**.
- **So the previous advice stands.** Update f behind the half-sd gate and keep whatever distortion the robot holds. That rule has the lowest worst-case regret at 15 of the 21 points of the &plusmn;50% sweep (0.26 to 0.56 px), and the joint update beats it at only one point.
- **The choice between the two depends on the reference, not on the held distortion.** Taking TUM's calibration as the truth favours the joint update, and taking the target-free anchor favours f-only, whichever distortion is held. That says the references disagree. It says nothing about the update rule.
- **A distortion gate doesn't work as specified.** It fires in 30 of 31 blocks even when the held distortion is exactly right. The windows' distortion is biased low by more than half its own error bar, so the gate would need a bias correction first.

One of the five predictions held, and that one for a different reason than planned.

**For someone running a camera in the field:** a distortion from any reasonable calibration of the same lens is good enough near the image centre. Spend the update budget on the focal length.

**Limits.** "Wrong" here means another real calibration or a scaled one, not a measured lens change. The test stops at 250 px, where distortion is small. The image edge, where it is large, is out of reach because the checkerboard's two-term model for the Kinect folds back at 381 px. The data are three sequences from two cameras, in overlapping blocks.

Code, numbers and the figure: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md), milestone 3zb.
