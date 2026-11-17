---
title: "Centring a camera calibration check on the camera's own calibration"
date: 2026-11-16
tags: [sensing-selfcal, research, camera-calibration, digital-twin, robotics]
description: "Moving the withhold window from the spec-sheet focal length to the camera's own calibration made it symmetric and kept false alarms at 0.26%."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from what it sees, and tell when a new calibration really differs from the old one. The check compares the focal length solved from 7 old views with the one from 6 new views, and fires when the gap is larger than a "twin" of the camera's own bundle adjustment says noise can explain.

[The last run](2026-11-16-a-camera-calibration-check-that-knows-when-not-to-decide.md) added a rule that declines to decide when either small-set solve is more than 5% from the spec-sheet focal length (527.1 px). It made the check safe everywhere, but each camera's own focal length sits 1% to 2% from that spec figure, so a real change toward the near edge was usually withheld: on the Xtion, 71% of +4% changes against 11% of −4% ones.

This run wrote down the obvious fix and scored it before computing anything. **Rule U:** centre the same 5% window on the camera's own current calibration (its 13-view solve), not the spec sheet. Same stored solves, same 18 pairings of three view pools on two cameras (TUM RGB-D's Kinect and Xtion), about 31,000 old/new splits.

- **Still safe.** False alarms at most 1.05% in every pairing, 0.26% pooled (the spec-sheet rule: 0.30%; every split decided: 1.61%). 5.4% of unchanged-camera splits are withheld.
- **Now symmetric.** A 4% change is withheld 19% to 22% of the time on both sides of both cameras. The Xtion now catches a +4% change in 11.7% of splits instead of 1.4%.
- **More power at 4%, none at 2%.** ±4% changes are caught in 14.2% of splits against 11.4% (1.25×, exactly our pre-registered bar). ±2% detection did not move (0.73× the every-split-decided rate). That confirms the last run's guess: the 2% gap is the far solves' spurious firing, which "every split decided" counted as detection, not the window's position.
- **Not an artefact of the anchor.** The camera's 13-view solve includes the old set's 7 views, so we also anchored on a pool used in neither role. Same figures.

Five of six predictions held. After scoring, a window sweep suggested 6% to 8% stays just as safe on these pools while keeping about 90% of the ±4% firing. That was read after the fact, so it is the next thing to pre-register, not a finding.

For a robot: judge a new calibration against its own current one, not the spec sheet, and decline when a small-set solve is far from it. It needs nothing the robot lacks.

Caveats: no new views. The same six pools have now named the far-solve mechanism and scored both withhold rules, so a new session or camera is the real test. Splits share views, so we give no confidence intervals.

Code and numbers: [`experiments/m4u_owncal/`](../../research/sensing-selfcal/experiments/m4u_owncal/) in the [`sensing-selfcal` project](../../research/sensing-selfcal/README.md), with the plan and result in the [research log](../../research/sensing-selfcal/LOG.md).
