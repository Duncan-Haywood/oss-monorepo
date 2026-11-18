---
title: "A flat checkerboard moved our principal point by 9 pixels"
seo_title: "Bent checkerboard calibration: principal point bias in OpenCV"
date: 2026-11-11
tags: [sensing-selfcal, research, camera-calibration, robotics]
description: "Assuming a printed checkerboard is flat shifted c_y by 5 to 10 px on real photos, with a 1 px error bar. OpenCV's released-object mode equals target-free BA."
---

**Correction (milestone 6, same day):** most of the shift below came from the corner detector, not the flat-board assumption. An 11×11 `cornerSubPix` window misplaced outer corners by up to 6.4 px; with OpenCV's `findChessboardCornersSB` the shift is 1.2 px (left) and 1.4 px (right). See [the follow-up](2026-11-11-the-23-pixel-window-that-bent-our-checkerboard.md).

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from the features it already sees, with no checkerboard, and know when the result is wrong. Its first milestone found two loose ends on OpenCV's stereo calibration photos (two real cameras, 13 views each). The target-free fit and Zhang's checkerboard calibration disagreed on the principal point's vertical coordinate c<sub>y</sub> by 8.7 px and 5.2 px. And the solver's own σ for the focal length was about twice too small. Milestone 5 tested one named suspect for each, after writing the predictions down first.

**Suspect 1: the board is bent.** The target-free fit treats the 54 corners as free 3-D points, and it found they are not on a plane: the two cameras independently reconstruct the same bend. OpenCV has a calibration mode for this, `calibrateCameraRO` ("released object", after Strobl and Hirzinger, 2011), which refines the board's shape along with the camera. We ran it, and it gave *exactly* the target-free answer on both cameras and both lens models, to a millionth of a pixel. The focal length, c<sub>y</sub>, their σ and the board shape all matched. That makes sense once you see it. With every corner free, the only thing the board still tells the solver is its metric size, and size says nothing about the intrinsics.

So the released-object fit isolates what the "flat, evenly spaced board" assumption does. On these photos it moves c<sub>y</sub> by **−8.7 px on the left camera and −5.3 px on the right** (−10.1 px with a second lens term). Meanwhile flat-board Zhang reports c<sub>y</sub> with a σ of about 1 px. Neither fit is ground truth, but the free-board one assumes less and fits better. (While checking this we also found that milestone 1 had compared OpenCV's per-point reprojection rms with our per-coordinate one. On one definition the target-free fit is 13 to 15% better, not 40%. The README now says so.)

**Suspect 2: a missing lens term.** The model had one radial distortion term, k<sub>1</sub>. Adding k<sub>2</sub> gives a clearly non-zero value (0.14 ± 0.02 left, 0.09 ± 0.01 right). It does not fix the overconfidence. Over the same 560 view subsets, the self-consistency rms z of the focal length went from 2.28 to 3.01. That rise rests on two small subsets; without the five largest it is 2.00. Either way, k<sub>2</sub> is not the cause.

**What is left is a pattern along one board axis.** The residuals of neighbouring corners are correlated, 0.31 and 0.24, whatever the lens model. The correlation lives along the board's columns (0.44 to 0.56, and higher two corners apart) and is near zero along its rows. A lens term acts radially in the image and would not pick out one board axis. So the cause is more likely the print, the mounting or the corner detector. We have not established which. For the robot's error bar it says where to look next: a σ that treats each board column as a correlated cluster.

For an engineer calibrating a camera with a printed board: if your principal point matters (stereo rectification, metric mapping), run OpenCV's released-object mode or a free-point bundle adjustment as a check. On these photos the flat-board answer was 5 to 10 px off and did not say so.

Code, data and the pre-registered hypotheses: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md), milestone 5 in its `LOG.md`.
