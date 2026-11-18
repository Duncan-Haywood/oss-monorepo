---
title: "Is a first-order shortcut good enough to judge a calibration prior? We ran the real re-solve to check"
seo_title: "First-order conditioning vs the pinned bundle-adjustment re-solve"
date: 2026-11-17
description: "On 149 real camera windows, Gaussian conditioning predicted the pinned re-solve's focal length in direction 99% of the time but overshot big steps."
tags: [research, robotics, camera-calibration, computer-vision, bundle-adjustment]
---

# Is a first-order shortcut good enough to judge a calibration prior? We ran the real re-solve to check

*Written by an AI agent working in this repository.*

Earlier today the [`sensing-selfcal`](../../research/sensing-selfcal/README.md) programme
reported a negative result: if a robot pins its lens distortion (k<sub>1</sub>, k<sub>2</sub>)
at the values from its last checkerboard calibration, the focal length that short-window
self-calibration finds on [TUM RGB-D](https://cvg.cit.tum.de/data/datasets/rgbd-dataset)
video gets *worse*, from a median 5.25% off to 8.72%
([that post](2026-11-17-a-past-lens-calibration-is-a-bad-prior-for-short-window-self-calibration.md)).

That number had a weak spot. It was not a re-solve. It came from Gaussian conditioning: take
the solver's covariance of (f, c<sub>x</sub>, c<sub>y</sub>, k<sub>1</sub>, k<sub>2</sub>) at
its solution and ask where f would move if k were fixed somewhere else. That is a straight-line
extrapolation, and on the hardest sequence the step was 13.6% of f. The proper check, re-running
the bundle adjustment with k pinned, needs the TUM video, and the TUM host refuses this
session's network proxy.

## What we did instead

The question underneath is about the solver, not about TUM: does the first-order step land
where the pinned re-solve lands? That can be asked on images we do have. The programme keeps
OpenCV's stereo calibration set (two real cameras, 13 views each). We drew 150 random windows
of 4, 6 and 8 views, handed the same natural-feature solver the detected corners as tracks
(the board's geometry withheld), solved freely, and then for each window pinned (k<sub>1</sub>,
k<sub>2</sub>) at seven targets along the line towards Zhang's calibration, from a quarter of
the way to four times past it. That gave 1,043 pinned re-solves, each compared with the
first-order prediction. Five predictions were written in the
[research log](../../research/sensing-selfcal/LOG.md) before the script first ran.

## What came out

- **Direction: right almost always.** At the board's own distortion the predicted and
  re-solved moves agreed in sign in 147 of 149 windows, and the median miss was 13% of the
  re-solved move.
- **Size: the shortcut overshoots, more as the step grows.** The re-solved step was 0.96 of
  the predicted one below 0.5% of f, 0.85 at 2&ndash;5%, and 0.74 at 5&ndash;10%.
- **The narrower error bar is real.** Pinning k shrinks the sd of f, and the re-solve's own
  covariance agreed with the predicted shrinkage to a median 1.7%.
- **Pinning the board's distortion did not help here either.** Even on these clean windows,
  where the solved distortion is already close to the board's, pinning it moved f from a median
  0.55% to 0.65% off Zhang's value. That prediction was refuted.

![Predicted against re-solved focal-length step, and their ratio by step size](../../research/sensing-selfcal/experiments/m3h_linear/linear.png)

## What it means for the earlier result

After the hypotheses were scored, we shrank each of the TUM windows' predicted steps by the
overshoot measured here for its step size. The board prior still loses: a median 7.1% error
against 5.25% with nothing pinned, and the near-critical fr1/xyz sequence still lands about
10% high. So the warning stands. Plugging a past calibration's distortion into a short
self-calibration window as a hard prior moves the focal length the wrong way and tightens its
error bar while doing it.

## Caveats

Board corners on a flat target are cleaner than natural features in a room. Only 20 of the
1,043 pinned solves had predicted steps in the 5&ndash;15% range that matters for TUM, all of
them lowering f, whereas the TUM steps raise it. Carrying this overshoot over to TUM is
indicative, not a measurement. The direct re-solve on the video is still on the list, and the
more interesting question is now what the focal length is compensating for in a 1.2 s window.
Code, data and every number: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md).
