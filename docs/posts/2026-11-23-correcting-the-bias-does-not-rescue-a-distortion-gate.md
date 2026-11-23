---
title: "Correcting the bias does not rescue a lens-distortion gate: what a self-calibrating camera should hold"
seo_title: "Camera self-calibration: why a distortion update gate fails"
date: 2026-11-23
tags: [sensing-selfcal, research, camera-calibration, robotics]
description: "On real TUM RGB-D video, a bias-corrected gate on self-calibrated lens distortion still fires on noise and costs more than holding the distortion."
---

A robot that re-estimates its camera intrinsics from its own video needs a rule for when to adopt the new values. The `sensing-selfcal` programme found one for the focal length: adopt the pooled estimate when it sits more than half its standard deviation from the held value. For the lens distortion, the previous milestone tried the same gate and it fired in 30 of 31 blocks even when the held distortion was exactly right, because the windows' distortion at 200 px from the centre comes out 0.6 to 1.7 px low. Its suggested next step was to remove that bias first and then test. This run ([milestone 3zc](../../research/sensing-selfcal/LOG.md)) tried it, with the hypotheses written down before the code.

It tried three ways to estimate the bias: from the other camera (a fleet with one robot whose camera was never characterised), from the other two sequences, and from the unit's own early windows against the calibration it was commissioned with. The data are the programme's 43 saved solves of 1.2 s windows from three hand-held TUM RGB-D sequences on a Kinect and an Xtion. Rules are scored by where rays land, the rms projected-radius error over 50 to 250 px, against three references per camera.

| Distortion gate (five windows, held distortion correct) | Fires in | Worst regret |
|---|---|---|
| No gate: adopt f behind its half-sd gate, hold the distortion | – | **0.48 px** |
| Uncorrected half-sd gate (milestone 3zb) | 30 of 31 | 1.02 px |
| Bias from the other camera | 24 of 31 | 1.00 px |
| Bias from the unit's own commissioning history | 23 of 31 | 1.02 px |
| Commissioning, widened to 2 sd (added after the results) | 5 of 31 | 0.67 px |

Three things went wrong, and each is a lesson that carries beyond this data.

1. **The bias belongs to the camera.** It is 1.37 px on the Kinect and 0.71 px on the Xtion, so a bias learnt on one camera under-corrects the other by 0.65 px. A fleet correction needs the same camera model, at least.
2. **A half-sd bar fires on noise.** With the bias removed exactly (each sequence's own median, which no robot has), the test statistic's median is 0.47 sd: the bar sits at the middle of the noise. The half-sd multiplier was tuned for the focal length, where adopting a wrong value is cheap. Set a gate's multiplier per quantity from what a wrong adoption costs.
3. **Even rare firing does not pay.** At 2 sd the commissioning detector fires in 5 blocks and still adds 0.19 px of worst-case regret, because adopting the windows' distortion carries their roughly 2 px ray error inside 250 px.

One prediction held: the corrected gate does notice a held distortion that is 50% wrong (27 to 29 of 31 blocks). The advice therefore gets firmer: update f behind its gate, keep the target-calibrated distortion, and treat a distortion check as an alarm that calls for a checkerboard recalibration, never as an update.

**Limits.** Two cameras, so the "fleet" is one other camera of a different make. The bias is measured against one board calibration per camera, the "wrong" distortions are simulated, the band stops at 250 px, and the 2-sd rules were added after reading the results and are unscored. Code: [`experiments/m3zc_biasgate/analyse.py`](../../research/sensing-selfcal/experiments/m3zc_biasgate/analyse.py); project page: [sensing-selfcal](../../research/sensing-selfcal/README.md).
