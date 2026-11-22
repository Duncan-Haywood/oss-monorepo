---
title: "A robot camera can re-learn its focal length from video, but should not touch its distortion"
seo_title: "Camera self-calibration: keep the distortion, update f and c_y"
date: 2026-11-22
tags: [sensing-selfcal, research, camera-calibration, robotics]
description: "On real TUM video, the update rule that works for focal length carries over to the vertical principal point but not to lens distortion, which comes out biased."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from the video it already records, and whether it knows when to trust the result. The last few steps settled a rule for the **focal length**: pool five short windows of video, and replace the held value unless the pool lies within half its own standard deviation of it. This run asked the obvious next question. Does the same rule work for the other numbers a calibration holds: the **principal point** (c<sub>x</sub>, c<sub>y</sub>) and the **lens distortion**?

No new video was solved. The TUM host still refuses this cloud session, so the step reused 53 saved solves from three TUM RGB-D sequences on two cameras (a Kinect and an Xtion). The predictions were written to the [research log](../../research/sensing-selfcal/LOG.md) before the script existed. Each rule was scored by the error it leaves the robot holding when the held value is stale by 0 to 10 px (0 to 2 px for distortion).

**What came out.**

- **c<sub>y</sub> (vertical principal point): the rule carries over.** "Adopt unless within half an sd" is the minimax rule against all three reference calibrations. Its worst-case regret is 2.04 px at five windows, against 2.89 px for always adopting. It is also chosen in every leave-one-sequence-out fold. Each sequence's pools sit within 1.3 px of the checkerboard calibration.
- **Lens distortion: biased, so keep the held value.** We measure distortion as the radial displacement 200 px from the image centre, where the Kinect's lens moves a point about 4.1 px. Every sequence, on both cameras, puts that displacement 0.6 to 1.7 px *below* every reference. The error bar from the window scatter is five times too narrow (rms z 5.5). A pool that agrees with itself is still wrong, so no update rule can catch it. The same bias appears with and without the causal prior, so the prior did not cause it.
- **c<sub>x</sub> on the Xtion: unsettled.** The pools sit 16 px from both the checkerboard calibration and TUM's published one, and 5 px from our own target-free anchor. Those three references disagree among themselves by 12 px. With data like this, the best policy is to keep the held value.
- **A check on the method.** The saved solves carry a solver error bar for the focal length only, so this step built the bar from scatter alone. Applied to the focal length, the scatter-only bar reproduces the earlier answer: the same rule, with a worst-case regret of 0.38 points against 0.42 before.

**For someone running a robot camera:** self-calibrate f and c<sub>y</sub> from video with the half-sd gate. Hold c<sub>x</sub> and the distortion from a checkerboard calibration, and do not let natural-feature windows move them. Three of the seven predictions held. Four were wrong, and the [log](../../research/sensing-selfcal/LOG.md) says how. The "keep it" wins hold only up to the edge of the staleness grid. A lens change bigger than that is something to catch another way.

**Limits.** Staleness here is a shifted held value, not a real refocus. A real refocus moves f, the principal point and the distortion together. The study has three sequences on two cameras, with overlapping blocks. Distortion is measured at one radius. The next step is to find where the bias comes from: whether the tracked features reach far enough from the centre to pin the curve's second term. Code: [`experiments/m3y_pp_dist/analyse.py`](../../research/sensing-selfcal/experiments/m3y_pp_dist/analyse.py); write-up: [project README](../../research/sensing-selfcal/README.md).
