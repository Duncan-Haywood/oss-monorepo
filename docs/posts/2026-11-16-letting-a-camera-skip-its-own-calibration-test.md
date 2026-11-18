---
title: "Letting a robot camera skip its own calibration check: more power, but not the safety we expected"
seo_title: "Camera self-calibration update test: when to abstain"
date: 2026-11-16
tags: [sensing-selfcal, research, camera-calibration, digital-twin, robotics]
description: "A twin-based gate that skips weak camera calibration checks catches 1.75× more 2% focal changes, but a flat set of views still raises false alarms to 5.9%."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from what it sees, and whether it can tell when a new calibration is genuinely different from the old one. Its update test compares the focal length from an old set of views with the one from a new set and fires if they differ by more than the noise allows. The threshold comes from a linearised "twin" of the camera's own bundle adjustment.

This morning's run ([milestone 4p](../../research/sensing-selfcal/LOG.md)) tried that test on views it had never seen before: 13 fresh frames from each of two TUM RGB-D calibration sequences (a Kinect and an Xtion). The fresh frames turned out flatter than the original ones, meaning the board was tilted less. On that weaker pool the test lost most of its power on the Kinect, and on the Xtion it fired falsely on 4.4% of unchanged cameras, over the programme's 2.5% limit. Our explanation at the time was that flat views produce occasional "far" solves, minima more than 5% off, that the linear twin cannot represent.

**This run tested a fix a robot could apply with no extra data:** run the test only when the twin says the views can resolve the change you care about. For each old and new view set, the twin already predicts the standard deviation of its focal length. If the predicted standard deviation of the difference is more than 1% of f, a 2% change is less than two standard deviations away, so the robot abstains. We fixed that 1% cut-off in the log before computing anything.

What happened, over 13,684 old/new splits of the two cameras' two pools:

- **Power went up.** Among the splits the gate let through, a 2% focal change was caught 15.9% of the time, against 9.1% when every split was tested (×1.75). The rate went up in every pairing of pools the gate scored.
- **The far solves disappeared.** 430 splits hold a far solve, and the gate scored none of them. On the Kinect's flat pool it scored nothing, so the robot abstains there instead of running a test that catches 2% of changes.
- **The Xtion's flat pool stayed unsafe.** False alarms there went *up*, from 4.4% to 5.9% of the scored splits. A cruder tilt-only gate did no better (5.3%).

The last result overturns our own explanation from this morning. If far solves were behind the over-alarm, removing every one of them would have fixed it. Instead, the false alarms come from splits the twin rates as precise when they are not. That fits two earlier numbers. The Xtion's two 13-view calibrations differ by 2.7 of the twin's own standard deviations, and on this unit the twin overstates the test's power by 1.96×. Both point to a per-view error, shared by all the corners in one frame, that the twin does not model.

So the gate is worth using, since it tells the robot when testing is pointless, but it does not make a threshold safe by itself. The next step is to add a per-view error term to the twin and check whether it brings the flat pool under the limit.

Two caveats, both written down before the run. The gate was checked on the same pools that prompted it, so this is a consistency check, not a confirmation. A third disjoint pool of views would be the real test, but the TUM data host refused this session's network proxy. Also, the splits share views, so we give no confidence intervals.

Code and numbers: [`experiments/m4q_gate/`](../../research/sensing-selfcal/experiments/m4q_gate/) in the [`sensing-selfcal` project](../../research/sensing-selfcal/README.md), with the pre-registered plan and result in its [research log](../../research/sensing-selfcal/LOG.md).
