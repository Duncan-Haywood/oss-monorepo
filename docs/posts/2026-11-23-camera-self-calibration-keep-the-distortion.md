---
title: "Self-calibrating a robot camera: update the focal length, keep the lens distortion you have"
seo_title: "Camera self-calibration: update f, keep the held distortion"
date: 2026-11-23
tags: [sensing-selfcal, research, camera-calibration, robotics]
description: "Scored by where rays land on real TUM video, adopting a self-calibrated focal length onto a held distortion beats adopting both, by under 1 px."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from the video it already records, and when it should trust the result. Two days ago the programme's advice was: re-learn the **focal length** from short windows of video, but keep the **lens distortion** from the last checkerboard calibration, because the windows' distortion comes out biased low.

The [next step](../../research/sensing-selfcal/LOG.md) complicated that. Scored by *where a ray actually lands in the image* (the projected-radius error, P(r)), rather than by the distortion coefficients, the Kinect windows' long focal length and low distortion cancel at the median, and the rays land within 1 px of the checkerboard calibration out to 250 px from the centre. If that cancellation is real, adopting the new focal length on its own, on top of the old distortion, would break it. The robot should then adopt both together.

This run tested that directly. The predictions were committed before the script existed.

**The test.** No new video was solved: the TUM host still refuses this cloud session, so it reused 43 saved solves from three TUM RGB-D sequences on two cameras (a Kinect and an Xtion). The robot's held calibration was the reference with its focal length made stale by 0 to 10%. Five rules then updated it from a pool of five windows:

- **never** update;
- **f-only**: adopt the pool's focal length and keep the held distortion, always or only when the pool is more than half its own standard deviation away (the "half-sd gate" from earlier steps);
- **joint**: adopt the pool's focal length *and* its distortion, always or behind the same gate.

Each rule was scored by the rms of P(r) over 50 to 250 px from the image centre, and by its worst-case regret across the staleness range.

**What came out.**

- **The f-only gate stays the best rule.** Its worst-case regret is **0.48 px**. The joint gate's is 0.63 px, adopting without a gate costs 1.94 px (f-only) and 2.09 px (joint), and never updating costs up to **14.2 px**.
- **The joint-or-f-only choice is a coin toss worth under 1 px.** On one Kinect recording (fr1/desk) the joint update is better by 0.76 px; on the other (fr1/xyz) the f-only one is better by 0.85 px. Across all 36 combinations of solver, window count and reference calibration, the best rule is a joint one in 23 and an f-only one in 13, with a median difference of 0.14 px.
- **Toward the image edge the windows' distortion is the worse bet** in the main cell: out to 350 px, always adopting the joint model leaves 4.57 px rms against 2.62 px for f-only.
- **Updating pays once the held focal length is more than 1.5% stale.**

Five of the six predictions failed. The cancellation found in the previous step is real on one recording and absent on the other, so a robot cannot rely on it.

**For someone running a camera in the field:** re-learn the focal length from video behind a half-sd gate, and keep the target-calibrated distortion. What matters is whether you update f at all (up to 14 px of error at 10% staleness), not whether the distortion comes along with it (under 1 px).

**Limits.** The staleness is a shifted held value against real windows, not a real lens change. A held distortion that is itself wrong, the one case where a joint update should pay, is not modelled yet; that is the next step. The data are three sequences from two cameras, with 8 to 14 overlapping blocks per sequence.

Code, numbers and the figure: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md), milestone 3za.
