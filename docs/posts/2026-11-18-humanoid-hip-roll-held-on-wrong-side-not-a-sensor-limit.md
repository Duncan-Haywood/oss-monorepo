---
title: "The nailing humanoid's hip joint was held on the wrong side, not short of sensor"
seo_title: "Humanoid hip joint held on the wrong side, not a sensor limit"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, force-torque-sensing, mujoco]
description: "Flipping one held hip joint's side lets the H1's worst nailing pose take the full preload: 0.172 mm falls to 0.005 mm with an FT 300-class wrist sensor."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. [This morning's step](2026-11-18-humanoid-hip-roll-margin-sets-the-wrist-sensor-spec.md) concluded that one pose of the Unitree H1 (grip at 1.4 m, 0.15 m to the left) needs a wrist force sensor with under about 0.19 N of vertical error. With a Robotiq FT 300's 0.2 N, the right hip roll slips across its friction threshold and leaves 0.172 mm at the tool point, against a 0.03 mm spec.

This step ([milestone 46](https://marisstella.app/research/buildbot-sheathing/)) shows that conclusion was wrong. The limit came from the controller's choice of side, not from the sensor.

## What changed

The balance controller holds a few lightly loaded leg joints against one side of their backlash, so the compensator knows where they sit. Since milestone 32 that side has been chosen once per robot, at a reference pose. At (1.4 m, −0.15 m) the right hip roll is held on the + side, and the hold constraint pins it at exactly its 0.2 N m friction threshold. Left to itself, the torque-minimising controller wants it at about −3.8 N m, firmly held on the other side.

A diagnostic found this before the run, and we disclosed it in the log with six registered hypotheses. The run then flipped that one joint's side at that one pose and changed nothing else.

## What happened

- **Margin.** The largest common leg margin the stance allows at a 50 N press rises from 0.033 to **2.29 N m**. The pose drops the special two-tier preload and takes the spec's own 0.1 N m, like the other 17 poses.
- **Residual.** With a 0.2 N sensor error, the worst tool-point residual along the wall is **0.005 mm** at 0, 5 and 20 N of hose drag (it was 0.172). No joint flips at any worst case. The H1's worst over all 19 poses goes back to 0.010, 0.019 and 0.032 mm.
- **Cost.** The clean-sheet stack is 0.9716 against 0.9715 before. Swept cases with no plan at the two re-planned poses go from 24 of 204 to 23.
- **Not only one joint.** The per-robot side disagrees with the torque-minimising one at both press ends at four other H1 poses: both hip yaws at the two lowest poses and both hip rolls at (1.4 m, 0) and (1.6 m, 0). Those poses still meet the spec, so it costs nothing measured there, but the per-robot rule is the real problem. That hypothesis (at most one other pose) was refuted. The other five held.

## What a designer takes from it

Choose held-joint sides per pose from the controller's own torque-minimising solution, not once per robot. With that, the zero-press stance keeps a spec-grade plan at 5 of the H1's 6 re-leaned poses with an FT 300-class sensor. The sixth has no holding solution at all. The earlier sensor bound came from a bad side choice, not from the pose.

The result is statics only, with a friction coefficient of 0.5 and the braked waist. Only one joint at one pose changed. The next step applies per-pose sides at every pose of both robots. Code and results are in [`research/buildbot-sheathing/experiments/m46_holdside`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing/experiments/m46_holdside).

*Produced with AI assistance (Claude). Simulation only; nothing was tested on hardware.*
