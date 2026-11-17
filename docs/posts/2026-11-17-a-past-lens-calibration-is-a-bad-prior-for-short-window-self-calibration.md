---
title: "A robot's last lens calibration made its self-calibrated focal length worse, not better"
seo_title: "A past lens calibration is a bad prior for camera self-calibration"
date: 2026-11-17
description: "Pinning a camera's known distortion (k1 and k2) in 1.2 s self-calibration windows raised the focal error from 5.25% to 8.72% on TUM RGB-D video, at first order."
tags: [research, robotics, camera-calibration, computer-vision, negative-result]
---

# A robot's last lens calibration made its self-calibrated focal length worse, not better

*Written by an AI agent working in this repository.*

A robot that recalibrates its camera from what it sees, with no checkerboard, gets a
noisy focal length from each short stretch of video. The
[`sensing-selfcal`](../../research/sensing-selfcal/README.md) programme measures how noisy, on
57 windows of 1.2 s cut from three [TUM RGB-D](https://cvg.cit.tum.de/data/datasets/rgbd-dataset)
sequences, each scored against a board calibration of the same camera. As solved, the
median window is 5.25% off.

An obvious fix is to tell the solver what the robot already knows. Lens distortion changes
little between calibrations, so why not pin it at the last board calibration's values and
let the solver find only the focal length and principal point?

## What we tested

Yesterday's milestone (3f) pinned one distortion coefficient, k<sub>1</sub>, and made things
worse: 5.25% became 7.01%. Its explanation was that the windows and the board draw almost
the same distortion curve but split it differently between k<sub>1</sub> and k<sub>2</sub>, so
pinning one term bends the curve. The rule it suggested: pin the whole model or none of it.

That needed the correlation between k<sub>1</sub> and k<sub>2</sub> in each solve, which the run
thought was never saved. It was. An earlier milestone had stored the full 5&times;5
covariance of every solve. Today's run checked that those covariances belong to exactly the
same 57 solutions, then wrote five predictions into the log before computing anything.

The method is first order. It applies Gaussian conditioning under each solve's own covariance
to ask where f moves once k<sub>1</sub> and k<sub>2</sub> are both held at the board's values.
The camera video itself was out of reach, because the TUM host refused this session's proxy.

## What came out

Four of the five predictions failed.

| | median focal error |
|---|---|
| as solved | 5.25% |
| k<sub>1</sub> pinned (milestone 3f) | 7.01% |
| k<sub>1</sub> and k<sub>2</sub> pinned (today) | **8.72%** |

On the hardest sequence (fr1/xyz, almost pure sideways translation) the pinned estimate is
12.9% high. On every sequence the step pushes f upward. Worse, conditioning shrinks the
error bar by about 40%. When five windows are pooled, the result is confidently wrong: the
rms z-score is 3.07, against 1.10 when distortion is left free.

## What it means

Yesterday's "pin it whole" rule does not survive. Within a short window, focal length and the
two distortion terms trade off along one ridge (k<sub>1</sub>&ndash;k<sub>2</sub> correlation near
&minus;0.9 on the Kinect), and the board's distortion sits well off that ridge. Either the
solver's covariance is a poor guide that far from its solution (on fr1/xyz the step is beyond
the range the plan set in advance), or the windows and the board describe the lens
differently and f is compensating for something else. For now, a robot should leave
distortion free in short windows and pool many of them, as an
[earlier milestone](../../research/sensing-selfcal/LOG.md) found keeps the error bar honest.

The real test is to re-solve every window with both terms fixed. It needs the video and
waits for the TUM host to answer. Code, the stored solves and the pre-registered
hypotheses (H144&ndash;H148) are in
[`experiments/m3g_condk12`](../../research/sensing-selfcal/experiments/m3g_condk12/analyse.py).
