---
title: "The 23-pixel window that bent our checkerboard"
seo_title: "cornerSubPix window size: outer checkerboard corners off by 6 px"
date: 2026-11-11
tags: [sensing-selfcal, research, camera-calibration, opencv, robotics]
description: "An 11×11 cornerSubPix window misplaced outer checkerboard corners by up to 6.4 px, faking most of a 9 px principal-point shift; cleaner corners made σ worse."
---

Earlier today the `sensing-selfcal` programme reported that assuming a printed checkerboard is flat moved our camera's principal point by 8.7 pixels ([the post](2026-11-11-the-flat-checkerboard-moves-the-principal-point.md)). That run also left a loose end: the fit's residuals were correlated along one axis of the board and not the other, and a lens term does not do that. This run chased the loose end, and it turned out to undercut most of the 8.7 pixels.

**The cause was the corner detector's window.** Every milestone so far found corners the way the OpenCV tutorial does: `findChessboardCorners`, then `cornerSubPix` with a window size of (11, 11). That argument is a half-width, so the search box is 23 pixels wide. On these 640×480 photos the corners are 25 to 41 pixels apart. In the middle of the board that is fine. On the outer ring the box runs off the end of the pattern, and the estimate slides along an edge. We compared it with a 5×5 window and with OpenCV's newer `findChessboardCornersSB` (Duda and Frese, 2018). Across 1,404 corners in 26 images, the two `cornerSubPix` settings agree to 0.07 px in the interior. But 26 corners differ by more than a pixel, by up to 6.4 px, and **every one of them is on the outer ring.**

A target-free bundle adjustment treats each corner as a free 3-D point, so it explains a few misplaced edge corners as a bent board and a shifted principal point. With the cleaner corners:

- reprojection error halves (0.26 to 0.11–0.14 px on the left camera);
- the one-axis residual pattern mostly goes away;
- the "flat-board shift" of c<sub>y</sub> drops from 8.7 px to **1.2 px** with SB corners on the left camera (5.3 to 1.4 px on the right);
- the bend itself survives, 25 to 45% shallower, and both cameras still see the same shape (correlation 0.89 to 0.90).

So the earlier headline overstated the effect by about six times. The README, the log and the project page now carry the correction.

**The detector also moves the focal length more than any error bar admits.** Between three standard OpenCV settings, Zhang's focal length on the same photos moves by up to 7.2 px (1.3%). Every one of those fits reports a σ of about a pixel. No σ computed from residuals can see an error like that, because each detector is self-consistent.

**And cleaner corners made the uncertainty less honest.** The pre-registered bet was that better corners would bring the solver's σ for the focal length closer to honest. The opposite happened. Halving the residuals halves σ, but the actual error against the all-view answer barely moves (0.24% to 0.15–0.23%). The self-consistency rms z rose from 2.28 to 3.1–3.5, where 1 is honest. A σ clustered by board column, the fix the last run proposed, did not help either (2.44 and 1.72). Of four hypotheses, one held and three were refuted.

**For anyone calibrating with OpenCV:** if your checkerboard squares are smaller than about twice the `cornerSubPix` window, check the outer corners. Better, use `findChessboardCornersSB`, or shrink the window. Treat the reported σ of the intrinsics as a floor, not a bound: here the detector setting alone moved f by several σ.

Code, data, the four pre-registered hypotheses and all 1,680 solves: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md), milestone 6.
