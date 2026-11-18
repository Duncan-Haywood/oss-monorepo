---
title: "When the views line up, the checkerboard lies more than the camera does"
seo_title: "Camera self-calibration uncertainty vs view geometry, real images"
date: 2026-11-11
tags: [research, sensing, camera-calibration, bundle-adjustment, robotics, opencv]
description: "On 560 real view subsets, view spread predicts focal error; self-calibration σ is 2× too small, the checkerboard's 6× when views are near parallel."
---

Earlier today the [`sensing-selfcal`](../../research/sensing-selfcal/README.md)
programme
[calibrated two real cameras without trusting the checkerboard](2026-11-11-calibrating-a-camera-without-the-checkerboard.md).
Bundle adjustment with the board's geometry withheld came within 0.24% of
OpenCV's checkerboard calibration, but its reported uncertainty was about
twice too small. A robot that recalibrates itself needs that number to be
right, because it decides whether to accept the new calibration. This step
asks when the solver's error bar fails, and whether it can gate an update.

## First, a solver that finishes

Every solve in the first step stopped on its iteration cap. Two things caused
that. The fix for the scale ambiguity held a camera at the world origin, so
its zero translation pinned nothing. And scipy's sparse trust-region solver
crawls on this problem. Pinning one corner's depth, writing the Jacobian
out analytically and switching to Levenberg–Marquardt fixed it: 560 of 560
solves converged, in at most 177 evaluations. The earlier result survived.
Rerunning the same 360 subsets gave an rms z-score of 1.945 against 1.944.

## Geometry predicts the error

For a flat target, focal length cannot be recovered when every view sees the
board at the same angle (Sturm and Maybank, 1999). We measured each subset's
*spread*, the largest angle between two views' board normals. Besides 400
random subsets, we took the 160 subsets of 3 to 6 views closest to that
critical case (spread 7° to 36°, against 65° for all 13 views).

The prediction, written down before the runs, was a rank correlation of at
most −0.3 between spread and focal error. It came out at −0.46 on the left
camera and −0.58 on the right. The solver's own σ also ranks the error
(ρ +0.39 and +0.45). So σ carries the right information, but at the wrong scale.

| | random, 4 views | near-critical, 4 views |
|---|---|---|
| median spread | 51° | 20° |
| median focal error, target-free | 0.54% | 1.09% |
| median focal error, checkerboard (Zhang) | 0.37% | 1.50% |
| rms z, target-free | 2.21 | 2.08 |
| rms z, checkerboard | 2.32 | 6.24 |

On the near-critical subsets the target-free σ is 2.4× too small, which
refutes our second prediction that it would stay within 2×. The checkerboard
calibration does much worse. Its σ is about 6× too small, and its focal length
is *further* off than the target-free one at 4, 5 and 6 views. When the views
line up, the known board geometry does not protect you, and the calibration
is most sure of itself where it is most wrong.

## Can σ gate an update?

The simplest gate accepts a new calibration when σ/f ≤ 0.5%. The target was
to reject 90% of updates more than 2% off and accept 90% of those within 1%.
It rejected 92% of the bad ones and accepted only 84% of the good ones. The five
bad updates it let through were 2.0 to 2.9% off, with σ just under the line.
Doubling σ rejects every bad update but throws away almost two thirds of the
good ones. An inflation factor fitted on one camera also overcorrects or
undercorrects the other. A fixed threshold on σ is not enough. The next gate
will use the geometry as well.

## Limits

One stereo rig, one board and one tutorial image set. The view spread is read
from the checkerboard poses, which a robot would not have. Correspondences are
clean corners, not matched natural features (that is the next milestone).
Code, data, pre-registration and every number are in
[`research/sensing-selfcal`](../../research/sensing-selfcal/README.md).

*Written with AI assistance (Claude Code).*
