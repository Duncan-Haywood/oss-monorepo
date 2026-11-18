---
title: "A nailing humanoid's hose-drag limits are necessary, but its calibration pose is the weak link"
seo_title: "Humanoid hose-drag limits and the calibration pose"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, mujoco]
description: "Past each pose's drag limit no nailing plan exists, but inside it 75 of the G1's 96 failures come from one calibration pose under sideways hose drag."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. [The last step](2026-11-18-humanoid-hose-drag-limit-no-lean-fixes.md) found how much air-hose drag each standing pose tolerates before the robot tips while pressing the nailer at 25 to 50 N. For the Unitree G1 at its 1.2 m grips it is only about 4 N pulling straight back.

This step ([milestone 51](https://marisstella.app/research/buildbot-sheathing/)) asked whether those per-pose limits work as a hose rule. If the hose never pulls harder than a pose tolerates, does every case in the tool-accuracy sweep get a plan?

## What we ran

We reran milestone 48's sweep: both robots, 0, 5 and 20 N of drag in 8 directions, and a 0.2 N wrist-sensor error on 6 axes. It reproduced milestone 48's dropped cases exactly: 258 of the G1's 1530 pose-cases and 41 of the H1's 1938. We then marked each pose-case as inside or outside an envelope. Inside means the drag is within milestone 50's limit at that pose and also at the calibration pose (1.0 m, 0), because the robot calibrates once there and every other pose depends on that calibration. We registered three hypotheses in the log before the run.

## What happened

- **The limits are necessary.** Every case outside the envelope has no plan: 162 of 162 on the G1, 36 of 36 on the H1.
- **Inside the envelope, coverage rises and accuracy holds.** The G1 plans 93.0% of its cases (83.1% overall) and the H1 99.7%. The worst residual along the wall stays in spec: G1 0.016, 0.011 and 0.011 mm and H1 0.010, 0.014 and 0.010 mm at 0, 5 and 20 N, against a 0.03 mm spec.
- **They are not sufficient.** 101 cases inside the envelope still have no plan, so that hypothesis was refuted. 75 of the G1's 96 come from the calibration pose: 45 of them with 20 N pulling sideways, only 35% of the drag that pose balances, and they fail with a perfect sensor too. The robot can balance there, but the planner finds no hold-and-preload solution. The other 30 have 5 N pulling the other way and fail only because of the sensor error. The remaining failures are at the 1.0 to 1.6 m grips.

## What a designer takes from it

A per-pose drag limit is the right hose rule for balance: no plan exists past it. But one calibration serves every pose, so a calibration that fails under load drops all 15 G1 poses at once. Calibration is a single move, so the cheap fix is to take it with the hose slack. That is the next step, along with finding which hold constraint binds at the remaining plan-limit poses.

The results are statics only. The friction coefficient of 0.5 has not been measured for these soles, and the hose-on-floor friction behind the metre figures is not sourced. Code and results are in [`research/buildbot-sheathing/experiments/m51_envelope`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing/experiments/m51_envelope).

*Produced with AI assistance (Claude). Simulation only; nothing was tested on hardware.*
