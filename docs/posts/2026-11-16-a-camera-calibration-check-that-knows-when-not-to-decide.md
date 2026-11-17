---
title: "A camera calibration check that knows when not to decide"
date: 2026-11-16
tags: [sensing-selfcal, research, camera-calibration, digital-twin, robotics]
description: "Declining to judge a calibration update when a small-set solve lands far from the spec sheet cut false alarms to 0.3%, at a quarter of the 2% detections."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from what it sees, and whether it can tell when a new calibration really differs from the old one. The check compares the focal length solved from 7 old views with the one from 6 new views, and fires when the gap is larger than a "twin" of the camera's own bundle adjustment says noise can explain.

[The last run](2026-11-16-a-third-pool-of-views-splits-the-camera-calibration-fix-by-camera.md) tested that check on a third set of views. On the Kinect it fired on up to 7.5% of cameras that had not changed. Almost all of those false alarms came from "far solves": small view sets whose geometry leaves the focal length nearly free, so the solver lands more than 5% away. An earlier milestone showed these are real minima of the data, not solver bugs, so they cannot be solved away. That run could only flag them with an oracle, the median over every subset of a pool, which a robot does not have.

This run wrote down a rule a robot can apply, and scored it before computing anything. **Rule W:** if either the old or the new small-set focal length is more than 5% from the spec-sheet value (527.1 px, the mean of the dataset's published calibrations for the two cameras), make no decision and ask for more views. Nothing else changes. We scored it on all 18 pairings of three view pools on two cameras (TUM RGB-D's Kinect and Xtion), about 31,000 old/new splits, reusing stored solves.

- **Safe everywhere.** False alarms fell to at most 1.11% in every pairing, 0.30% pooled, from 1.61% when every split is decided. The Kinect pairing that had been at 7.47% dropped to 0.32%.
- **Rarely withheld.** At no focal change, W declines 5.8% of splits. It agrees with the oracle flag on 94% to 100% of splits per pairing.
- **Not free.** It catches a 2% focal change in 3.9% of splits against 5.3% when every split is decided (0.73×, below the 0.8× we predicted). Most of that gap is the far solves' spurious firing, which "every split decided" was counting as detections. The real cost is at 4%. The spec-sheet value sits 1% to 2% from each camera's own focal length, so a change toward the near edge of the window is often withheld: on the Xtion, 71% of +4% changes.
- **Both fixes are needed.** Without the per-view jitter added to the twin [two runs ago](2026-11-16-one-number-that-makes-a-camera-calibration-test-safe.md), W still leaves the flat Xtion pool at 4.8%.

Three of five predictions held. The one near miss: the Kinect's third pool was to stay under 1% in all five of its pairings, and one sat at 1.11%. The other miss was the 0.8× power bar.

For a robot, the practical version is simple. If either solve disagrees with the spec sheet by more than 5%, don't trust the comparison. Collect more views. Missing a big change that way is not silent, because the robot knows it declined. The next step is to centre that window on the camera's own current calibration instead of the fleet figure, so a change in either direction costs the same.

Caveats: no new views. All three pools were already used by earlier milestones, the far-solve explanation came from the same data, and the dataset host refused our proxy, so a new camera or session was not possible this time. Splits share views, so we give no confidence intervals.

Code and numbers: [`experiments/m4t_withhold/`](../../research/sensing-selfcal/experiments/m4t_withhold/) in the [`sensing-selfcal` project](../../research/sensing-selfcal/README.md), with the plan and the result in the [research log](../../research/sensing-selfcal/LOG.md).
