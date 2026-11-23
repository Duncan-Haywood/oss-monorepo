---
title: "Which camera intrinsics should a robot re-learn from its own video? f and c_y, not c_x or the distortion"
seo_title: "Camera self-calibration: which intrinsics to re-learn from video"
date: 2026-11-23
tags: [sensing-selfcal, research, camera-calibration, robotics]
description: "On real TUM RGB-D video, a robot should update f and c_y from self-calibration and hold c_x and the lens distortion: the paper's new Recommendation 9."
---

The `sensing-selfcal` programme's paper draft now answers a question its earlier sections left at the focal length: when a robot re-estimates its camera intrinsics from short windows of its own video, **which of them should it actually adopt?** This run folded four logged milestones (3y to 3zb) into Section 4 of the [draft](../../research/sensing-selfcal/paper/draft.md) and its letter-length cut, with 38 new checks that tie every quoted number to a saved result. No new experiment was run; every figure below is from the [research log](../../research/sensing-selfcal/LOG.md).

The data: 43 saved solves of 1.2 s windows from three hand-held TUM RGB-D sequences on two cameras (a Kinect and an Xtion), pooled five at a time, scored against three published or derived calibrations of each camera. Staleness is simulated by shifting the held value, not by a real lens change.

| Intrinsic | Rule that minimises worst-case regret | Why |
|---|---|---|
| Focal length f | adopt the pool unless it is within half its sd of the held value | worst regret 0.38 points, survives leaving a sequence out |
| Principal point c<sub>y</sub> | the same half-sd gate | worst regret 2.04 px; pools sit within 1.3 px of the board |
| Principal point c<sub>x</sub> | never adopt | 2.86 px against 7.14 for always; the Xtion's pools sit 16.8 px off and the references disagree by 12 px |
| Distortion at 200 px | never adopt | the windows put it 0.6–1.7 px low in every sequence |

Then the question a robot cares about: not the distortion coefficients, but **where a ray lands**. Scored that way over 50–250 px from the centre, adopting the windows' f onto the held distortion stays the safest rule (worst regret 0.48 px, against 0.63 for adopting their distortion too). The two differ by under about 1 px either way, while not updating a stale f at all costs about 14 px at 10% staleness. And keeping a held distortion is robust: even with its k<sub>1</sub>, k<sub>2</sub> off by 50%, it leaves 1.51 px, less than the 2.09 px of adopting the windows' f and distortion together.

Two side lessons made it into the paper. A two-term checkerboard fit with negative k<sub>2</sub> can fold back inside the image (the Kinect board model at 381 px), so check a reference distortion for monotonicity before using it near the edge. And the solver's own covariance is about nine times too narrow at every radius, so the error bar has to come from the camera's own window-to-window scatter.

**Limits.** Three sequences, two cameras, simulated staleness, and a 250 px band; the image edge, where distortion is large, and the radii the tracked features actually cover are still unmeasured. The next steps are a bias-corrected distortion gate and a real refocus or zoom to score the rules on.
