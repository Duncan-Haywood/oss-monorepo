---
title: "A self-calibrating camera can't spot a bad video window by how far it turned"
seo_title: "Camera self-calibration: does view swing predict focal error?"
date: 2026-11-16
tags: [sensing-selfcal, research, camera-calibration, robotics, bundle-adjustment]
description: "On 57 windows of TUM RGB-D video, how far the optical axis swung in 1.2 s did not predict the self-calibrated focal error (Spearman +0.08)."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from ordinary video, without a checkerboard, and whether it can tell when the answer is wrong. The last two runs found that one 1.2-second window of hand-held video gives the focal length only to about 4 to 9%. They also found that pooling about eight windows with a random-effects model gets a 2.5% error bar that is still honest. One sequence did not behave: on TUM's `fr1/xyz`, where the camera mostly slides rather than turns, the windows share an offset of about −3% that no error bar admits.

Textbook theory has a candidate explanation. Pure translation is a *critical motion* for focal length (Sturm, 1997): if the camera only slides, a wrong focal length fits the images as well as the right one once the scene is stretched in depth. Rotation about the lens's own axis adds nothing either. So the useful motion is the optical axis swinging. Total rotation, which the previous run tried as a gate and which failed, counts roll as well. This run asked whether the *swing of the optical axis*, which a robot can read from its own solved camera poses, marks the bad windows.

**What we did.** We re-solved the same 57 windows exactly as before. Every focal length matched the earlier run to 0.01 px. For each window we measured the largest angle between the optical axes of any two of its 12 keyframes, once from the solver's poses and once from TUM's motion capture. Five predictions were written in the log before any angle was computed.

**What came out (one of five predictions held):**

- **The solver sees the swing.** Its axis spread matches motion capture's with a Spearman correlation of 0.98, and the per-sequence medians agree to 0.4°. A robot can measure this without extra sensors.
- **But the swing is not the problem.** The median swing was 20.5° on the desk sweep and 8.3° on `fr1/xyz`. The smallest was 4.7°, on `fr3/stf`, and that sequence's windows pool well (1.2% off at eight windows).
- **It does not predict error.** Across all 57 windows, the Spearman correlation between axis swing and focal error was +0.08. We had predicted −0.3 or lower.
- **A gate on it hurts.** Dropping the lowest third of windows by swing removed 3 of 18 `fr1/xyz` windows and 16 of 39 others, nearly all from the good `fr3/stf`. The median error of the kept windows was 5.30%, against 5.25% for all of them.
- **Roll was not hiding anything.** The axis swing is 84 to 94% of the total rotation in every sequence, which is why the previous run's rotation gate behaved the same way.

**What it means.** None of these hand-held windows is close to pure translation. Even on `fr1/xyz` the median swing is 8°. So at 1.2 seconds the motion's geometry is not what limits the answer. What is left looks tied to the scene or the camera session. One unscored hint: in every sequence the solver's own covariance couples focal length tightly to the first lens-distortion term (median |correlation| 0.63 to 0.77). That points at distortion rather than motion. A fielded robot has a previous calibration, so the next pre-registered test fixes the distortion terms at the old values and checks whether `fr1/xyz`'s offset goes away. Until then the practical rule stays the one from the last run: pool windows with a random-effects model until the error bar is small enough, and don't throw windows away for turning too little.

Code, data provenance, and the log with the predictions as written: [`research/sensing-selfcal`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/sensing-selfcal). The TUM RGB-D sequences are CC BY 4.0 (Sturm et al., IROS 2012). The live page is at [marisstella.app/research/sensing-selfcal/](https://marisstella.app/research/sensing-selfcal/).
