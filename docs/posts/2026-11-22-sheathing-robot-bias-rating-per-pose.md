---
title: "One number per pose certifies a humanoid nailer against sensor bias up to 1 N"
date: 2026-11-22
tags: [buildbot-sheathing, construction-robotics, humanoid, force-sensing, simulation]
seo_title: "Humanoid nailer: certify each press against sensor bias"
description: "A per-pose sensitivity table lets simulated G1 and H1 nailers certify every press against 0.3 to 1.0 N of sensor bias: none of 3,219 certified presses failed."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a nailer against a sheathed wall and land each press within 0.03 mm of where its model says. The planner reads the air hose's pull from a wrist force sensor, and that sensor can be biased.

[Milestone 67](2026-11-21-sheathing-robot-bias-aimed-at-direct-term.md) found two useful facts, after the run. Once the robot's reference calibration is taken under the same bias, the error a bias causes is exactly linear in it, with nothing left over. And the slope depends only on the robot's pose, not on the hose load. Both were observations on 8 loads, not tested claims. Milestone 68 registered five hypotheses in the [log](../../research/buildbot-sheathing/LOG.md) and tested what those facts would buy.

**The gate.** Freeze milestone 67's slopes as a table: four numbers per pose (nail head and a point 44 mm along the nail, along and across the wall), 15 poses on the G1 and 19 on the H1. Before making a press, the planner adds the bias bound times the slope to its existing allowance for backlash flips. It accepts the press only if every row stays inside 0.03 mm. The bias bound B was 0.3, 0.4, 0.6 and 1.0 N. Two adversaries tried to break the presses the gate accepted: a bias aimed along the steepest slope, and the earlier bias aimed at the weakest joint. Both signs, on 12 new held-out hose loads (seed 68).

**What came out.** All five hypotheses held.

- **The table transfers.** On all 393 presses where the slope was measured afresh, it matched the frozen table to 4 × 10⁻¹⁴ mm/N.
- **The gate holds.** Not one of the 3,219 presses it accepted left 0.03 mm, at any bound, under either adversary. The worst was 0.0285 mm on the G1 and 0.0292 mm on the H1.
- **The gate is needed.** Without it, the aimed bias at 0.4 N breaks 144 G1 and 68 H1 presses. At 1.0 N it breaks 259 and 342, with errors up to 0.14 mm.
- **Coverage is the price.** The gate certifies 64% of G1 and 90% of H1 cases at 0.3 N, 57% and 85% at 0.4 N, 21% and 52% at 0.6 N, and 20% and 10% at 1.0 N.

**Checked after the run: the bound is exact, not just safe.** Under the aimed bias, the error on every accepted press equals the gate's bound to three figures. So the gate does not refuse presses out of caution. It refuses exactly the presses that the worst bias in the ball would break. The backlash allowance never decided a refusal (it was at most 0.008 mm on the G1 and zero on the H1). The whole gate therefore comes down to one number per pose, a **bias rating**: 0.03 mm divided by the steepest slope. On the G1 those ratings run from 0.213 to 1.06 N, on the H1 from 0.279 to 1.31 N, and one pose on each robot is insensitive to bias altogether.

**What it means for a practitioner.** If you know your force sensor's worst bias, you can tell before nailing which poses are safe. That takes a table built once, offline, from four planner runs per pose. A 0.3 N sensor keeps most of the work, and a 1 N sensor confines the robot to its few least-sensitive poses. Raising a weak pose's rating is now a concrete target, and the next milestone asks which joints set it.

**Limits.** This is simulation only (MuJoCo models of the Unitree G1 and H1), in statics, on 12 loads from one seed, with the table built on 8 loads from another. The sole friction of 0.5 is not measured. Backlash flips are still bounded by the planner's flip allowance, not by the same exact certificate. Code, results and figure: [`experiments/m68_jgate/`](../../research/buildbot-sheathing/experiments/m68_jgate/).
