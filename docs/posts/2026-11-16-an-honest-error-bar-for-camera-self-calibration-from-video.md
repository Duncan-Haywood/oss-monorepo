---
title: "An honest error bar for camera self-calibration from video: leave one keyframe out"
seo_title: "Honest error bars for camera self-calibration from video"
date: 2026-11-16
tags: [sensing-selfcal, research, camera-calibration, bundle-adjustment, robotics]
description: "A delete-one-keyframe jackknife cut the rms z of self-calibrated focal length from 9.3 to 1.8 on TUM RGB-D video. The honest error bar turned out wide."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from what it sees, with no checkerboard, and whether it knows when the answer is wrong.

[Milestone 3b](2026-11-16-a-camera-calibrating-itself-from-ordinary-video-is-overconfident.md) tried that on ordinary hand-held video: SIFT tracks over 12 keyframes (1.2 s) of three TUM RGB-D sequences, with a bundle adjustment over focal length, principal point, two distortion terms, every pose and every point. The focal length typically landed 3% to 7% from the board calibration. The solver's own standard deviation was 4 to 12 times too small: rms z of 9.3, where an honest error bar gives about 1.

This run tested three ways to get an honest error bar, all pre-registered before any number was computed:

- **Re-solve with each keyframe left out** (a jackknife, 12 warm-started solves per window): **rms z 1.76** over 57 windows, with 89% of errors inside 2 sd (the solver: 18%). Its typical sd also matches how far f really scatters from window to window, in all three sequences (0.9 to 1.6 times).
- **A sandwich covariance clustered by track**, which would fix errors correlated along a feature's track: rms z 6.6. Residuals barely correlate from one keyframe to the next along a track (medians between −0.15 and +0.14), so that was not the cause.
- **A sandwich clustered by keyframe**, unscored because it is known to run low with 12 clusters: rms z 3.0, most of the way there.

So the missing error enters per keyframe: one frame's pose, blur or rolling shutter shifts the whole solve. A linear covariance cannot see that, and a re-solve can. After scoring we also found that a single keyframe carries a median 38% to 46% of a window's jackknife variance.

The honest answer is sobering. The jackknife's sd is a median **6.4% of f**, and only 5 of 57 windows (9%) get under 2%. On fr1/xyz, the sequence that only translates (the textbook near-critical motion for focal length), the jackknife is still too small (rms z 2.58) and barely grows (1.54 times the general-motion sequence's, where we predicted at least 2). Two of six predictions held.

For a robot this means:

- Never trust a short window's solver sd.
- The jackknife costs about 12 extra warm-started solves and gives an error bar you can act on: usually it says "pool more windows".
- A motion check (rotation from the solved poses or an IMU) is still needed to withhold translation-only stretches.

Caveats: one dataset and two cameras, the same 65 windows as milestone 3b, and windows from one sequence share a scene, so they are not independent draws.

Code and numbers: [`experiments/m3c_jackknife/`](../../research/sensing-selfcal/experiments/m3c_jackknife/) in the [`sensing-selfcal` project](../../research/sensing-selfcal/README.md), with the plan and result in the [research log](../../research/sensing-selfcal/LOG.md).
