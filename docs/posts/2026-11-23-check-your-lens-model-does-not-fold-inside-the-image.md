---
title: "Keep your camera's lens distortion, unless it folds inside the image: self-calibration at the frame's edge"
seo_title: "Camera self-calibration at the image edge: check the fold radius"
date: 2026-11-23
tags: [sensing-selfcal, research, camera-calibration, robotics]
description: "At the image corner, holding a calibrated lens distortion is safe only if the model does not fold inside the frame; two Kinect fits fold at 381 and 403 px."
---

The `sensing-selfcal` programme has spent several milestones on one practical question: when a robot re-estimates its camera intrinsics from short windows of its own video, which ones should it adopt? So far the answer was to **update the focal length behind a half-sd gate and keep the lens distortion it was calibrated with**. All of that was scored by where rays land between 50 and 250 px from the image centre. The edge was left out, which is a real gap, because distortion is largest there.

The edge was left out because the reference we had been using, a checkerboard calibration of the Kinect with two radial terms, **folds back at 381 px**: past that radius its projection stops rising, so it cannot serve as the truth there. This run (milestone 3zd) checked the other references first. TUM's own published calibration, which carries a third radial term on the Kinect, rises steadily past 600 px on both cameras. The image corner is about 405 to 410 px from the principal point, so TUM's model can serve as the truth out to 400 px.

## What we found

Scored against TUM's calibration from 250 to 400 px, on the same 43 saved solves from three TUM RGB-D sequences, pooled five windows at a time (full numbers in the [research log](../../research/sensing-selfcal/LOG.md)):

| Held distortion (Kinect) | Edge error, nothing updated, right f | Update f only (gate) | Adopt the windows' distortion too |
|---|---|---|---|
| TUM's (the truth) | 0.0 px | 0.0 px | 5.5 px |
| Board fit, folds at 381 px | 17.3 px | 17.3 px | 5.5 px |
| Target-free fit, folds at 403 px | 14.4 px | 14.4 px | 5.5 px |

Median rms error across 250 to 400 px, at zero focal-length staleness, over the 17 Kinect blocks.

- **Where the held model is valid at the corner, the old advice holds.** On the Xtion, where none of the three references fold, an f-only rule had the smallest worst-case regret in 7 of 9 truth and held-model pairs.
- **Where it folds, the advice fails.** The Kinect's two-term fits agree with TUM's model to within half a pixel inside 250 px. Across the outer band they are 14 to 17 px away from it, and adopting the self-calibrated distortion cuts that to about a third. The pooled windows' distortion folds inside the image in none of 31 blocks, although single windows can fold from 390 px.
- Two of the five pre-registered predictions held. The most notable miss: we predicted that "f only" would stay minimax at the edge, and it did not. Over the three held models the joint gate was minimax, at 4.36 px against 7.62.

## What a practitioner can do with it

You can test whether a polynomial lens model folds inside the frame from its coefficients alone: step along the projection r(x) = f x (1 + k1 x² + k2 x⁴ + k3 x⁶) and find where it stops rising. If the fold radius is inside the image corner, the held distortion is not a safe default near the edge, whatever its reprojection error was. Reprojection error only covers the radii the calibration's features reached. In that case, recalibrate with a third radial term, or, as a stopgap, the self-calibrated distortion did better at the corner in this data. The check is `fold_radius` in [`experiments/m3zd_edge/analyse.py`](../../research/sensing-selfcal/experiments/m3zd_edge/analyse.py).

## Limits

There is one truth at the edge, and on the Kinect nobody knows which model is right beyond about 300 px. A folded model is certainly wrong past its fold, but that does not make TUM's model right before it. The windows' own feature radii are not in the saved solves, so their distortion at the corner may be extrapolated. The verdicts pooled over both cameras turn on as little as 0.09 px. Staleness is simulated, not a real lens change. Next, when TUM's data host answers: a three-term board refit of the Kinect frames to settle which model is right at the corner.

*Written with AI assistance (Claude Code). Analysis of saved solves only; no new frames were processed.*
