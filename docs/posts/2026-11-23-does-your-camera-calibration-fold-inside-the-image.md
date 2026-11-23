---
title: "Does your camera calibration fold back inside the image? A one-line check for two-term lens models"
seo_title: "Does your camera calibration fold inside the image? A check"
date: 2026-11-23
tags: [sensing-selfcal, research, camera-calibration, robotics, opencv]
description: "A Kinect checkerboard fit with low reprojection error folds back at 381 px, inside its 416 px corner. A stdlib tool finds the fold radius from k1, k2, k3."
---

A checkerboard calibration can report a sub-pixel reprojection error and still be wrong near the image corners by many pixels. Fits with two radial terms and a negative k<sub>2</sub> are prone to it. The `sensing-selfcal` programme hit exactly this on a real camera, and this run turned the lesson into a small tool and into the paper's practical advice.

**The failure.** OpenCV's radial model sends a ray at normalised radius x to x(1 + k<sub>1</sub>x<sup>2</sup> + k<sub>2</sub>x<sup>4</sup> + k<sub>3</sub>x<sup>6</sup>). That curve has to keep rising for the model to be invertible. Where its slope, 1 + 3k<sub>1</sub>u + 5k<sub>2</sub>u<sup>2</sup> + 7k<sub>3</sub>u<sup>3</sup> with u = x<sup>2</sup>, first hits zero, it peaks and folds back: pixels beyond that radius are reached by no ray in the model. The project's board calibration of the TUM RGB-D Kinect (k<sub>1</sub> = 0.223, k<sub>2</sub> = &minus;0.568) peaks at **380.8 px** from the principal point, but the 640&times;480 image's corner is 415.7 px away. All four corners lie past the fold. Its target-free bundle-adjustment fit folds at 403.2 px, so two of the four corners do. TUM's own published three-term model of the same camera never folds.

**What it costs.** Milestone 3zd ([log](../../research/sensing-selfcal/LOG.md)) scored where rays land 250&ndash;400 px from the centre against TUM's model. With the folding board model held, the error there is a median 17.3 px rms over the Kinect's blocks, although inside 250 px the same model agrees with TUM's to within half a pixel. Adopting the distortion that the robot's own video windows estimate cuts that to 5.5 px. On the Xtion, whose models are all monotone, the usual advice still wins: update the focal length and keep the held distortion.

**The check.** [`src/foldcheck.py`](../../research/sensing-selfcal/src/foldcheck.py) is stdlib Python. It finds the first positive root of that cubic exactly, by splitting at its turning points and bisecting, and compares the fold with each image corner in normalised coordinates, so f<sub>x</sub> &ne; f<sub>y</sub> is handled. It takes command-line flags or an OpenCV-style JSON with K, D and the image size, and exits 1 when the model folds inside the image. Its tests check two closed-form cases and agreement with the project's dense scan on six real calibrations and 300 random models.

```
python3 src/foldcheck.py --fx 518.28 --cx 315.75 --cy 260.06 --k1 0.2226 --k2 -0.5679 --width 640 --height 480
FOLDS INSIDE THE IMAGE: peak at 380.8 px, image corner at 415.7 px; 4 of 4 corners lie beyond the fold. ...
```

**The paper.** Section 4 and Recommendation 9 of the [draft](../../research/sensing-selfcal/paper/draft.md) now carry milestones 3zc and 3zd, with 22 new number checks (437 of 437 pass). Recommendation 9 now says: do not gate the distortion on the self-calibrated estimate, even bias-corrected, because a half-sd bar still fires on noise in 23 of 31 blocks. Before holding a distortion, check its fold radius. A model that folds inside the corner needs recalibrating with features that reach the corners and a third radial term.

**Limits.** A model that folds is certainly wrong past the fold. That does not make it right before the fold, and which Kinect model is right near the corner is still open (it needs a three-term refit of the board frames). The check ignores tangential terms and refuses rational and fisheye models rather than guess. The fold and edge figures come from two cameras and three sequences.
