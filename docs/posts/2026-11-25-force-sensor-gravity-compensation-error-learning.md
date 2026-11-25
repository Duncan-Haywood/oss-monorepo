---
title: "A force sensor's gravity-compensation error broke our tracking filter. Reading once after each tare fixed it"
seo_title: "Learning a force sensor's gravity-compensation error after tares"
date: 2026-11-25
tags: [buildbot-sheathing, research, robotics, force-sensing]
description: "An unknown 0.02 N gravity-model error made a naive bias filter fail 51% of simulated walls; carrying it in the state and reading after each tare holds 1%."
---

A robot that nails sheathing to a wall needs its wrist force/torque sensor to stay zeroed: the sensor's bias drifts, and a press read through a drifted bias lands outside its allowance. The `buildbot-sheathing` programme found two steps ago that the robot can read the bias in free air once a sheet and subtract a filtered estimate from the sensor offset, instead of stopping to re-zero (tare). On most simulated cases that removed every tare.

There was a catch. A free-air reading only tells you the bias after you subtract the tool's weight through a gravity model, and that model is never exact. A fixed 0.02 N error at the reading pose, unknown to the filter, took the wall's failure rate from 1% to about 12%. This run ([milestone 78](../../research/buildbot-sheathing/LOG.md)) asked whether the filter can learn that error rather than ignore it.

**Why it is learnable.** In this model a tare is exact: it sets the bias the presses see to zero. The gravity-model error at the reading pose is the same vector every sheet. So a reading taken just after a tare sees the error almost alone. A Kalman filter whose state holds both the drifting bias and the fixed error (here called AUG) learns the error from every reading that follows a tare. AUG+R adds one free-air reading straight after each tare, when the bias is known to be zero. Since the filter's variance does not depend on the readings, the tare schedule can still be planned before the wall starts, and each policy was calibrated by simulation to 1% wall failure. Seven hypotheses were registered before the run.

| G1 humanoid, layout plan, 0.1 N drift, 0.01 N reading noise | Re-zeros per 100 sheets | Wall failure |
|---|---|---|
| Error known to be zero (milestone 77) | 48 | 1.06% |
| Error ~ N(0, 0.02²) N a axis, filter ignores it | 48 | **51.5%** |
| Same, filter ignores it, recalibrated | 99 (tares every sheet)* | 0.00%* |
| Filter carries the error (AUG) | 91 | 1.00% |
| Carries it and reads after each tare (AUG+R) | **67** | 0.76% |
| Open-loop optimum, no readings (milestone 75) | 96 | 1% target |

Each row except the starred one was checked on 10,000 fresh simulated walls. *The recalibrated naive filter found no level at or above the search floor of 1e-5 a sheet that met 1%; a side check at 1e-7 on the 4,000 calibration walls tared every sheet with no failures.

What held and what did not:

1. **Ignoring the error is not a small miscalibration.** The naive filter's risk table says a carried sheet is safe, so a stricter risk level adds no tares. On the G1's banded plan it tares 0 times at every level tried, down to 1e-7, and fails 1.38% of walls.
2. **The augmented filter keeps its promise.** All 72 cases (18 robot and plan cases, two noise levels, two error priors) calibrated, and the worst fresh failure was 1.09%.
3. **Learning the error is cheap where tares are needed anyway.** The median extra cost over knowing the error is 7.7%. The worst case is the table above: 67 against 48, still 30% under the open-loop optimum. AUG+R needed no more re-zeros than the open-loop optimum on all 11 large cases, and none at all on 9 of them.
4. **The reading after a tare pays, slightly less than predicted.** It cut AUG's 91 to 67 (a ratio of 0.74, against the 0.70 registered), and removed AUG's tares on two cases entirely.
5. **It holds up beyond the prior.** Planned for a 0.02 N prior and run with a fixed 0.04 N error, AUG+R failed 0.78% of walls on the weak pose.
6. **One hypothesis was badly framed.** I predicted the recalibrated naive filter would lose to AUG+R on 9 of the 11 large cases. It lost on 4; on the other 7 every policy tied at 0 tares, or at the 100 in-sheet re-zeros one plan needs anyway.

The practical rule: if a robot reads its force bias through a gravity model, put the model's error at the reading pose into the filter state, and take one reading straight after every tare. Most of the gain from tracking survives, and the risk accounting stays honest.

**Limits.** Simulation only. The error is one fixed vector, from a single reading pose; a pose-dependent error is the next step. Its prior, the random-walk drift and the reading noise are swept, not measured on a sensor. Noise is white and independent; tares are exact; the post-tare reading is assumed to take no extra time. Code: [`experiments/m78_augfilter/run.py`](../../research/buildbot-sheathing/experiments/m78_augfilter/run.py); filter: [`augfilter.py`](../../research/buildbot-sheathing/src/buildbot_sheathing/augfilter.py); project page: [buildbot-sheathing](../../research/buildbot-sheathing/README.md).
