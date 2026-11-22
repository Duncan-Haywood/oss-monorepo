---
title: "That lens-distortion bias was mostly the focal length: score camera calibration by where rays land"
seo_title: "Camera calibration: score where rays land, not k1 and k2"
date: 2026-11-22
tags: [sensing-selfcal, research, camera-calibration, robotics]
description: "On real TUM video, self-calibrated distortion looked 1.4 px off, yet the Kinect windows put rays within 1 px of the board out to 250 px from the centre."
---

The previous step of the `sensing-selfcal` programme found that a robot camera re-calibrating itself from video gets its **lens distortion** wrong. At 200 px from the image centre, every sequence put the distortion 0.6 to 1.7 px below every reference calibration, on both cameras. The advice was to keep the distortion from a checkerboard calibration and never let the video move it.

This run asked whether that error is real. A robot does not use k<sub>1</sub> and k<sub>2</sub>. It uses **where a ray lands in the image**, and that depends on the focal length and the distortion together. A slightly long focal length and slightly weak distortion can cancel. So the run compared two scores across image radii from 50 to 350 px: the distortion term alone, and the projected-radius error P(r), meaning how far from the centre the self-calibration puts a ray that the reference puts at r.

No new video was solved, because the TUM host still refuses this cloud session. The step used 43 saved windows from three TUM RGB-D sequences, plus an earlier run that stored the solver's full 5&times;5 covariance. The seven predictions were written to the [research log](../../research/sensing-selfcal/LOG.md) before the script existed. Three held.

**What came out.**

- **On the Kinect, most of the bias cancels.** At the median, the windows put a ray **within 1 px of the board out to 250 px**, and within 0.7 px of TUM's published calibration out to 300 px. Over the same radii the distortion term alone is off by up to 1.4 px. The windows' longer focal length and weaker distortion offset each other.
- **On the Xtion, the error is the focal length.** P(r)/r stays near +2.4 to +2.8% from the centre outwards, which is the signature of a focal length that is too long, not of a wrong lens model. The focal-length update rule from earlier steps already covers that case.
- **Single windows are still noisy.** The cancellation holds at the median, not window by window. One window's focal-length scatter moves a ray 2 to 3 px at 200 px.
- **The solver's error bar is about nine times too narrow at every radius** (rms z 9.3 to 9.6). That is why the history floor from milestone 3u is still needed.
- **The checkerboard reference folds back inside the image.** The board's two-term model for the Kinect (k<sub>2</sub> &lt; 0) reaches its largest image radius at **381 px**, but the image corner is 416 px from its principal point. Past about 300 px the model is no reference at all, so any "error at the edge" measured against it is an error in the reference.

**What this means for a robot.** Score a self-calibration by where rays land, at the radii the robot uses, not by its distortion coefficients. Before trusting a reference distortion at the image edge, check that it is monotone there. The earlier advice to hold the distortion still stands for the Xtion's off-axis c<sub>x</sub>, but for the Kinect the distortion term was a misleading measure.

**Limits.** The feature radii the windows cover could not be measured without the frames. P(r) leaves out the principal point and tangential distortion. The three references disagree with each other at the edge by more than the effect being measured. The code is [`experiments/m3z_radial/analyse.py`](../../research/sensing-selfcal/experiments/m3z_radial/analyse.py), and the project page is [sensing-selfcal](../../research/sensing-selfcal/README.md).
