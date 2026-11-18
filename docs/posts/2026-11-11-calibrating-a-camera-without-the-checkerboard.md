---
title: "Calibrating a camera without trusting the checkerboard, and finding the checkerboard bends"
seo_title: "Camera self-calibration without a target: 0.2% from Zhang, real images"
date: 2026-11-11
tags: [research, sensing, camera-calibration, bundle-adjustment, robotics, opencv]
description: "Target-free bundle adjustment lands within 0.24% of OpenCV's checkerboard calibration on two real cameras, and shows the board itself is not flat."
---

Every robot camera gets calibrated with a checkerboard once, and then drifts:
knocks, heat and refocusing move the focal length and lens distortion. Taking
the machine out of service to wave a board in front of it again costs time. The
alternative is to let the camera recalibrate itself from the points it already
tracks. A new research programme,
[`sensing-selfcal`](../../research/sensing-selfcal/README.md), asks how well
that works on real images, and whether the solver knows when it has got it
wrong.

## The test

OpenCV ships 26 real calibration photos from a stereo pair: 13 views of a 9×6
checkerboard from each of two cameras (Apache-2.0). We calibrated each camera
twice from the same detected corners:

- **Zhang's method**, OpenCV's `calibrateCamera`, which is told the board is a
  flat grid of equal squares;
- **target-free bundle adjustment**, which only knows that corner 17 in one
  photo is corner 17 in another. The 54 corners become free 3-D points, the
  focal length starts 30% wrong, and the solver works out poses, points, focal
  length, principal point and one distortion term together.

## What came out

| | left camera | right camera |
|---|---|---|
| Zhang focal length (σ) | 535.62 px (0.88) | 539.71 px (1.07) |
| Target-free (σ) | 534.82 px (0.98) | 538.43 px (1.20) |
| Gap | 0.15% | 0.24% |

Both gaps are under one standard error, the answer is the same from a start 30%
high or 30% low, and the target-free uncertainty is only 1.12 times Zhang's. We
had predicted, and written down before running anything, that dropping the
board's geometry would at least double the uncertainty. It did not. With 13
well-spread views the board's known layout buys little.

## The board is not flat

The target-free fit has smaller residuals than Zhang's (0.26 against 0.42 px on
the left camera). Because its corners are free, we could look at the shape it
reconstructed: the corners leave their best-fit plane by 0.8% of a square on
average and 2.4% at worst. That could be noise, except that the two cameras,
solved separately, reconstruct the *same* bend: the out-of-plane maps correlate
at 0.90 (0.91 with a second distortion term). A printed board on a stiff
backing that is slightly bowed is a known problem (Strobl and Hirzinger, 2011);
here it shows up without anyone measuring the board. It is also a reminder
that the "reference" calibration assumes something false at the 1% level.

## Does the solver know when it is wrong?

This is the question a robot needs answered before it accepts a new
calibration. We solved 400 random subsets of 3 to 12 views and compared each
focal length with the all-view reference, in units of the solver's own
reported σ. An honest σ gives an rms of 1. Target-free bundle adjustment gave
1.94 (95% interval 1.75 to 2.12) for 4 to 12 views, worst with few views; Zhang's
own σ did no better at 2.16. So both report uncertainty about half the size of
the real spread. A robot that used either σ to accept an update would accept
too many.

## What is next

This is one rig, one board and checkerboard corners with no mismatches. The
programme's next steps ([proposal](../../research/sensing-selfcal/PROPOSAL.md))
are a map of which view sets make self-calibration ill-posed, a σ correction
fitted on one camera and tested on the other, and the same test with natural
image features instead of board corners. Every number above comes from the
code and images in the project directory; the runs and pre-registered
hypotheses are in its [log](../../research/sensing-selfcal/LOG.md).

*Written with AI assistance (Claude Code).*
