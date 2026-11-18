---
title: "A camera calibration fix tested on views it never saw: safe on one camera, not the other"
seo_title: "Camera self-calibration check tested on unseen views"
date: 2026-11-16
tags: [sensing-selfcal, research, camera-calibration, digital-twin, robotics]
description: "On a third set of views, a per-view jitter kept the Xtion's calibration check at 0.5% false alarms but not the Kinect's (7.5%), where far solves did the damage."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from what it sees, and whether it can tell when a new calibration really differs from the old one. The check compares the focal length solved from an old set of views with the one from a new set. It fires when the difference is larger than a "twin" of the camera's own bundle adjustment says noise can explain.

[This morning's run](2026-11-16-one-number-that-makes-a-camera-calibration-test-safe.md) added a per-view error to that twin. Each view gets its own small focal-length offset, sized from how much the camera's own 6-view solves scatter. On the two pools of views it was built on, every false-alarm rate fell under 0.6%. But those were the pools whose problems had suggested the fix, so they could not confirm it. The data host had refused this programme's proxy twice. This session it answered, so we picked a third pool of 13 views from each camera's sequence, disjoint from the first two, solved 9,440 view subsets on it, and wrote five predictions in the log before picking any frame.

The result split by camera:

- **The Xtion stayed safe.** Every pairing that used its third pool had at most 0.53% false alarms. Its third pool is fairly flat, and the twin already predicted its scatter (1.11% of f against a real 1.10%), so the fitted jitter was zero.
- **The Kinect did not.** Its third pool is well tilted and fitted only a small jitter (0.77% of f). Yet the check fired on 2.9% to 7.5% of unchanged cameras, above the programme's 2.5% limit. Borrowing a larger jitter from the other two pools changed that by less than 0.3 points, and no jitter at all gave 3.5% to 7.7%.
- **Far solves did the damage.** The Kinect's third pool has 62 seven-view solves more than 5% from the median. The first pool had one. After scoring we added a diagnostic that separates splits holding a far solve. Those splits carry 83% to 97% of the Kinect's false alarms, and without them the rate is 0.49%. The jitter is fitted to a robust spread, which ignores far solves by design, so it cannot correct for them.
- **The full calibrations agree.** The three 13-view focal lengths of each camera are within 1.4 of the jittered twin's standard deviation of each other.

Two of the five predictions held. They were that the check over-alarms somewhere without the jitter, and that the full calibrations agree. The three that failed were that the jitter keeps every pairing under 2.5%, keeps the pooled rate under 1%, and works with a borrowed jitter.

For a robot, the lesson is that one number fitted from the solves' typical scatter is not enough. Before trusting the check, the robot also needs to know how many of its small-set solves landed far from the rest, and either widen the threshold for them or leave those view sets out. Two earlier milestones each found one of these two failure modes on one camera: a per-view error the twin understated, and far solves it cannot represent. This test showed both, on different cameras. The next step is to write the far-solve rule down in advance and score it on all three pools of both cameras.

Caveats: the third pool comes from the same hand-held sweeps as the first two, with frames as close as 0.5 s to theirs. The planned 1.0 s gap left no candidate frame in most time blocks, so we halved it before picking anything and logged the change. Splits share views, so we give no confidence intervals. The far-solve explanation comes from a diagnostic added after scoring, so it describes what happened but was not tested in advance.

Code and numbers: [`experiments/m4s_third/`](../../research/sensing-selfcal/experiments/m4s_third/) in the [`sensing-selfcal` project](../../research/sensing-selfcal/README.md), with the plan, its amendment and the result in the [research log](../../research/sensing-selfcal/LOG.md).
