---
title: "We ran our camera update test on two more cameras. The false alarms held up; the power didn't"
seo_title: "Camera self-calibration update test on TUM RGB-D Kinect and Xtion data"
date: 2026-11-14
tags: [research, sensing, camera-calibration, self-calibration, statistics, robotics, digital-twin]
description: "On a Kinect and an Xtion from TUM RGB-D, the update test stays at 0.06–0.80% false alarms with 5–6 new views, but catches a 2% focal change in 10%, not 33%."
---

The [`sensing-selfcal`](../../research/sensing-selfcal/README.md) programme asks whether a robot can
recalibrate its own camera without a target, and whether it can tell when the new focal length is
really different from the old one. This morning's step
[gave that test a threshold drawn from the camera's own calibration](2026-11-14-a-camera-can-draw-its-own-update-test-threshold.md):
1.4% and 0.4% false alarms, and a 2% focal change caught from 6 new views in 33% of tests.

Every number in the programme so far came from one stereo rig: the 13 tutorial images OpenCV ships
for its two cameras. The paper draft's list of what a submission still needs began with "the twin
reference pre-registered on a second unit's views". This step did that.

## Two more cameras, with their makers' own calibration

The [TUM RGB-D benchmark](https://cvg.cit.tum.de/data/datasets/rgbd-dataset) (Sturm et al., IROS
2012, CC BY 4.0) publishes a checkerboard sequence for each of its cameras, and the authors' own
calibration of each. We took two: a Microsoft Kinect (`freiburg1`, strong lens distortion) and an Asus
Xtion (`freiburg3`, whose images come already undistorted). They differ from the OpenCV pair in
sensor, lens and board (8×6 corners, not 9×6). In every frame a person holds the board, so we
committed only the detected corners and a script that fetches the sequences, not the images.

Before any solve we wrote down how to pick 13 views from each sequence of about 1,400 frames, and five
predictions. The first rule we tried took the sharpest frame in each slice of time. Before anything was
solved, it turned out to favour distant boards (7–8 px between corners) and boards facing the camera
squarely. That is the pose in which the focal length is least well determined. We replaced it with the
most tilted of the sharper frames, with corners at least 15 px apart, and the log says so. Then 11,442
self-calibrations, every subset of 3 to 7 views of each camera, ran through the same solver and the
same analysis code as the OpenCV pair. Nothing was re-tuned.

## What held

- **The calibration itself.** On the Xtion the target-free focal length is 533.9 px, 0.64% from TUM's
  537.3. On the Kinect it is 1.85% high. That was expected, because the one-term lens model we fit
  cannot follow that lens's distortion.
- **The false-alarm rate, with 5 or 6 new views.** Against its own twin threshold, the test fired on
  0.80% and 0.76% of unchanged updates on the Kinect, and 0.62% and 0.06% on the Xtion. The design
  target is 1%. Nothing was tuned on these cameras.

## What did not

- **With 4 new views the test over-alarms:** 3.3% and 4.7%. Each 4-view set's leave-one-out solves use
  3 views. With 3 views the linearised twin stops describing the solver, and the real solves fail most
  often: 12 and 49 of the 286 three-view sets did not converge.
- **Power is a property of the camera.** A 2% focal change from 6 new views is caught in 10% of tests,
  not 33%. These hand-held 640×480 captures fix the focal length less precisely. Over all 6-view sets
  it spreads by 0.73% and 0.51%, against 0.51% and 0.30% on the OpenCV cameras. The cold-start solver
  also lands far from the answer on some subsets: 8 and 30 of 1,716 six-view sets ended more than 5%
  out, against none on the OpenCV images.
- **The real swap was smaller than we predicted.** TUM's calibrations put the two cameras 3.5% apart.
  Our own 13-view solves put them 1.4% apart, because the Kinect's model bias closes most of the gap.
  The test caught that real difference in 6–8% of splits. That is between its rates for scaled changes
  of 1% (2.0%) and 2% (10.0%). This is the programme's first check of the test on a change no script
  applied, and the test behaved the way its synthetic power curve said it would.

Four of five predictions failed. Only the anchor, the Xtion's focal length, held.

## What it changes

The practical advice gets more specific. Do not run the twin-referenced test with fewer than 5 new
views. Expect its power to depend on how well your capture pins down the focal length, not on the
statistics. And guard every subset solve against far minima, either by starting it from the full
solution or by checking that it stayed in the right basin. Those far minima now look like the biggest
thing standing between this test and the 33% it reached on the OpenCV images. The next step is to
remove them, again pre-registered, and re-score both cameras.

The numbers, code and log are in
[`experiments/m4j_tum`](../../research/sensing-selfcal/experiments/m4j_tum/) and the
[research log](../../research/sensing-selfcal/LOG.md). The paper draft's Section 7 now reports both
the OpenCV results and these.

*Written with AI assistance (Claude Code). TUM RGB-D data © the TUM Computer Vision Group, CC BY 4.0.
No affiliation with TUM or any lab named in the programme is implied.*
