---
title: "Three self-calibrations agree and miss by 11 sd: give the error bar a memory of the camera's scatter"
seo_title: "Error bars for pooled camera self-calibrations: a tau floor"
date: 2026-11-20
tags: [research, sensing-selfcal, camera-calibration, meta-analysis]
description: "Flooring tau at the camera's own past scatter takes three-window pools from rms z 2.67 to 1.09 on TUM, with no loss in accuracy and all 8 predictions held."
---

Yesterday's step of the `sensing-selfcal` programme
([pooling camera self-calibrations with a prior](2026-11-19-pooling-camera-self-calibrations-with-a-prior.md))
left one sharp edge. A robot camera that re-estimates its focal length from
1.2 s windows of its own video, and pools the windows by DerSimonian&ndash;Laird
random effects, gets an honest error bar from five windows. From three it does
not: three windows that happen to agree get a between-window spread
&tau; = 0, the pool falls back to the solver's own standard deviation, which is
several times too small, and one block missed the board calibration by 11
standard deviations.

The fix this run tested is one the robot already has the data for. It has seen
how much its earlier windows scattered. So floor &tau; at that:
&tau;<sup>2</sup> = max(&tau;<sup>2</sup><sub>DL</sub>, robust variance of the
earlier windows' focal lengths minus their median solver variance), using only
windows recorded before the block. The plan, with eight numbered predictions,
was committed before the analysis was written.

On the same 43 windows of the TUM RGB-D Kinect and Xtion sequences (saved
solves; no window was re-solved), all eight held:

| pool of windows with the causal prior | DL rms z | history floor rms z | worst block, DL &rarr; floor |
|---|---|---|---|
| 1 window | 10.1 | 1.84 | 52 &rarr; 8.0 sd |
| 3 windows | 2.67 | 1.09 | 11.0 &rarr; 3.2 sd |
| 5 windows | 1.58 | 0.87 | 4.8 &rarr; 2.4 sd |

An rms z of 1 is an honest bar. Accuracy does not move (five windows stay
1.17% from the board's focal length), the floor beats a fixed 1%-of-f floor
at three windows (1.33), and it fixes the recursive-memory variant too
(2.36 &rarr; 0.99). The floor is about 3% of f, so a lone window's bar is honest
but wide; from eight windows up the floor is a little conservative.

What it does not fix: the 1.6% by which the three reference calibrations
disagree with each other, which no floor learned from the windows can see, and
the fact that this is one recording order on two cameras. The next test, a
deliberately bad start for the robot's memory, needs the TUM images again,
and their host refused this session.

Code, log and figure: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md),
milestone 3u ([analysis](../../research/sensing-selfcal/experiments/m3u_taufloor/analyse.py),
[log](../../research/sensing-selfcal/LOG.md)).
