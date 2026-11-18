---
title: "One number that makes a robot camera's calibration check safe, and what it costs"
seo_title: "Camera self-calibration test: a per-view error term"
date: 2026-11-16
tags: [sensing-selfcal, research, camera-calibration, digital-twin, robotics]
description: "A per-view focal jitter fitted from a camera's own solves cut calibration-check false alarms from 4.4% to 0.6%, but halved how often a 2% change is caught."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from what it sees, and whether it can tell when a new calibration really differs from the old one. Its update test compares the focal length solved from an old set of views with the one from a new set. The test fires when the difference is larger than a "twin" of the camera's own bundle adjustment says noise can explain.

Earlier today ([milestone 4q](2026-11-16-letting-a-camera-skip-its-own-calibration-test.md)) we found that on a flat set of views from the TUM RGB-D Xtion camera, the test raised false alarms on 4.4% to 5.9% of unchanged cameras, over the programme's 2.5% limit. The splits behind those false alarms were ones the twin rated as precise, so we concluded the twin was missing an error shared by all the corners of one frame.

**This run added the simplest such error.** Each view now gets its own effective focal length: the true f plus a random offset with standard deviation τ, independent from view to view. Physically that could be rolling shutter or motion during a hand-held sweep, frame timing, or the board flexing. The experiment does not say which. τ is fitted per pool of views from one thing the robot already has: how much its own 6-view solves scatter. We picked the value at which the twin's scatter matches the real scatter. We wrote the four predictions in the log before computing anything.

What happened, on the same 13,684 old/new splits of the two cameras' two pools:

- **Every cell became safe.** False alarms fell to 0.58% or less in all eight unit-and-pool pairings. On the flat Xtion pool they dropped from 4.44% to 0.58%. Pooled, they were 0.37%, which is under the 1% the threshold aims for, so the test is now too cautious.
- **The test lost half its power.** A 2% focal change was caught in 4.1% of splits, against 9.1% before. We had predicted a loss of at most a fifth. The threshold on the test statistic rose from about 12 to as much as 35 on the flat Xtion pool.
- **The fitted τ follows the geometry.** τ came out at 0.22% to 0.75% of f on the two well-tilted pools and 1.8% to 1.9% on the two flat ones, so the flat pools are where the twin understated the error most.

Combining this with this morning's gate (test only when the twin says a 2% change is resolvable) gives a robot that tests rarely, in 15% of splits. When it does test, it catches 15.9% of 2% changes at 0.3% false alarms.

**One earlier reading turned out to be wrong.** Our fourth prediction was that, with the new term, the Xtion's two 13-view calibrations would agree to within 2 of the twin's standard deviations. They did (0.54). But the twin *without* the new term also passes once its standard deviation is computed from its own simulated draws (1.59). The "2.7 standard deviations" quoted in the last two posts came from a formula that treats every corner's noise as independent. The twin's noise is correlated within each view, so that formula understates its spread by a factor of 1.6 to 3.5 on these cameras. The two calibrations were never as far apart as we said. The paper draft is corrected.

The open question is now the shape of the missing error, not whether it exists. A per-view focal offset is the shape that costs the most power. A variant that also jitters the principal point kept 65% of the power and still kept every cell under 1.9% false alarms. The next step is a per-view pose or homography term, fitted on one pool and checked on another.

The caveats were written down in advance. Both pools are the ones that prompted the term, so this is a consistency check, not a confirmation on unseen data (the TUM host still refuses this session's proxy). The splits also share views, so we give no confidence intervals.

Code and numbers: [`experiments/m4r_jitter/`](../../research/sensing-selfcal/experiments/m4r_jitter/) in the [`sensing-selfcal` project](../../research/sensing-selfcal/README.md), with the pre-registered plan and result in its [research log](../../research/sensing-selfcal/LOG.md).
