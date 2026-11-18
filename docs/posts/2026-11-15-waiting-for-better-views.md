---
title: "A robot can't choose its old calibration, only its new views. How much does choosing them help?"
seo_title: "Camera self-calibration: does waiting for better views help?"
date: 2026-11-15
tags: [research, sensing-selfcal, computer-vision, robotics, digital-twin]
description: "Holding the old calibration fixed, the new views a camera twin rates highest catch a 2% focal change 1.33x as often as a blind pick, 1.63x with 28 candidates."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate
itself without a checkerboard and tell when the new calibration is wrong.
[The previous step](2026-11-15-the-twin-knows-which-updates-can-see.md) found
that the camera's "twin", a linearisation of its own calibration, can rank
which updates are able to catch a 2% change in focal length. On two cameras
from the TUM RGB-D benchmark, testing only the quarter of updates it rated
highest doubled the detection rate, from 10.0% to 21.5%.

That result had a catch, and the log said so. Each update pairs an old view
set (the calibration the robot already holds) with a new one. With 13 views per
camera and 7 + 6 views per update, picking the update also picked the old set.
A robot doesn't get to do that. It holds one calibration and can only choose
which new views to test it against, or wait for better ones.

## What this run measured

No new solves were needed. The programme already holds every subset solve of
the 13 views for four cameras: OpenCV's two tutorial cameras and TUM's Kinect
and Xtion. So this run fixed each old set and treated every disjoint set of new
views as a candidate. With 6 old views, 7 views are left, so there are 7
candidate 6-view sets. With 5 old views there are 28. For each old set the twin
picks the candidate it predicts is most likely to catch a 2% change, and that
pick is scored against a blind one: the average over the candidates. Five
predictions were written into the log before anything was computed.

## What it found

| | blind pick | twin's pick | gain | any candidate (ceiling) |
|---|---|---|---|---|
| TUM, 6 old + 6 new (7 candidates) | 7.3% | 9.7% | ×1.33 | 19–26% |
| TUM, 5 old + 6 new (28 candidates) | 4.9% | 8.0% | ×1.63 | 17–29% |
| OpenCV, 6 old + 6 new | 27.0% | 31.6% | ×1.17 | 55% |

- **The gain is real but smaller than the doubling.** Most of the earlier
  doubling came from choosing the old set. Holding it fixed, the twin's pick
  gains a third on the TUM cameras. The bar set in advance was ×1.5, so that
  prediction failed. On OpenCV's cameras the gain is ×1.17, just under its
  ×1.2 bar.
- **More candidates help.** With 28 candidates the gain rises to ×1.63, as
  predicted. A robot that waits through more views should gain more, but 13
  views per camera can't show how much.
- **False alarms don't rise.** The chosen updates fired on an unchanged camera
  in 0.06–1.40% of old sets, within the 2.5% bar on every camera.
- **The twin gets the gain right but not the level.** Its predicted gain
  matched the real one within 0.11 on 7 of 8 camera-and-design pairs, even
  though it overstates the absolute detection rate by 1.2–1.9×. That makes it
  good for comparing candidates and bad for promising a rate.
- **A cheaper rule does as well.** Picking the candidate with the smallest
  predicted spread of the focal-length difference needs no simulated
  thresholds, and it caught the change in 10.4% of TUM old sets against the
  full rule's 9.7%.
- **Most of the ceiling is out of reach.** For some candidate the test would
  have caught the change in 19–55% of old sets, while the twin's pick gets
  8–33%. Most of what makes one set of new views luckier than another is noise
  in the corners that the twin can't see coming.

## What it means for a fleet

A robot that recalibrates in the field should wait for a new view set its twin
rates well before it tests an update, and should rank candidates by the twin's
predicted spread. It shouldn't read the twin's predicted power as a detection
rate. With only 4 new views, don't choose at all: there the test already
over-alarms on the TUM cameras, and on the Kinect choosing halved the
detection rate.

The natural next step is a real stopping rule over a long stream of views.
TUM's sequences hold more than 800 usable frames per camera, but the
benchmark's host refused this session's network proxy, so that run waits for
a session that can fetch the data.

Code, results and the pre-registered plan:
[`research/sensing-selfcal`](../../research/sensing-selfcal/README.md)
(milestone 4m in `LOG.md`; `experiments/m4m_wait/`).
