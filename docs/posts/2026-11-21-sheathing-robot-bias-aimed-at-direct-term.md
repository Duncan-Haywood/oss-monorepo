---
title: "A humanoid nailer's 0.2 N sensor-bias guarantee survives the worst bias direction, and is now certified"
date: 2026-11-21
tags: [buildbot-sheathing, construction-robotics, humanoid, force-sensing, simulation]
seo_title: "Humanoid nailer: worst-case sensor bias, certified to 0.21 N"
description: "Aiming a wrist-sensor bias at a simulated G1 and H1 nailer's most sensitive direction keeps every press within 0.03 mm at 0.2 N, and breaks at 0.3 N."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a nailer against a sheathed wall and land each press within 0.03 mm of where its model says. The planner reads the air hose's pull from a wrist force sensor, and since milestone 55 every margin it keeps has been sized to a sensor bias of at most 0.2 N.

That guarantee had been tested, not proved. Milestones 63 to 65 threw random biases and a bias aimed at the weakest joint at it, and it held. Then [milestone 66](2026-11-20-sheathing-robot-planner-sized-to-the-bias.md) priced the bias's direct effect, how a wrong force reading bends the robot by a wrong amount, and found it large: about 0.16 to 0.18 mm per newton. At 0.2 N, that is 0.032 to 0.036 mm, already over the spec. Either the guarantee had a hole nobody had aimed at, or that estimate was too pessimistic.

There was one reason to suspect the second. Milestone 66 held the robot's reference calibration fixed. A constant sensor bias is present when the robot calibrates too, and the compensation subtracts the reference pose's error, so part of the effect should cancel.

**Four hypotheses went into the [log](../../research/buildbot-sheathing/LOG.md) before the run.** The 0.2 N guarantee survives a bias aimed at the direct term. The calibration cancels at least half of milestone 66's estimate. 0.15 N holds. At 0.3 N this aimed bias breaks presses that the earlier adversary could not.

**The adversary.** For each press, the run measures how each of the four checked points (nail head and a point 44 mm along the nail, along and across the wall) moves per newton of bias. The whole planner re-plans and the calibration is re-made under the bias each time. The bias is then aimed along the largest of those sensitivities, at 0.15, 0.2 and 0.3 N, with the planner sized to match.

**What came out** on 8 new held-out hose loads (seed 67), all four hypotheses held:

- **The calibration cancels about half.** The median measured sensitivity is 0.061 mm/N on the G1 and 0.048 mm/N on the H1, 0.46 of milestone 66's figure at the same presses. The adversary almost always aims at the nail's depth point, across the wall.
- **0.2 N holds.** No planned press leaves 0.03 mm at 0.15 N or 0.2 N. The worst is 0.0282 mm on the G1 and 0.0215 mm on the H1, and every case is planned.
- **0.3 N does not.** 34% of planned G1 presses and 10% of H1 presses leave the spec (worst 0.042 and 0.032 mm), every one without a backlash flip. The earlier joint-margin adversary at 0.3 N had left none over.

**The surprise came from a check made after the run:** the error is exactly linear in the bias. With no bias the residual is zero. On all 1,608 flip-free aimed cases, the error equals the bias times the measured sensitivity to within 10⁻¹⁴ mm, whichever plan the planner picked. So the bias times that sensitivity is the exact worst case over every bias direction, not an estimate. And the sensitivity depends only on the robot's pose, not on the hose load. That makes it a table computed once per pose.

**What it means for a practitioner.** The 0.2 N spec is now certified, not just tested, for the part of the error that does not come from backlash flips. Every press tested is safe to at least 0.213 N on the G1 and 0.279 N on the H1. The G1's margin is thin: its worst press uses 0.0282 of the 0.03 mm. To plan for a sensor that drifts more than that, budget the measured through-calibration sensitivity per pose, which is about half of milestone 66's estimate. Checked after the run, a gate built on it passes every press at 0.2 N, where milestone 66's gate passed 64 of 117 on the G1. The next milestone registers that gate and tests it at 0.3 to 1.0 N.

**Limits.** This is simulation only (MuJoCo models of the Unitree G1 and H1), in statics, on 8 loads from one seed. The sole friction of 0.5 is not measured. Backlash flips are still bounded by the planner's flip budget, not by the same exact certificate. Code, results and figure: [`experiments/m67_aimeddirect/`](../../research/buildbot-sheathing/experiments/m67_aimeddirect/).
