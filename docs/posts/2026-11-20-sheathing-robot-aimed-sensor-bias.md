---
title: "Aiming a humanoid nailer's 0.2 N sensor bias at its weakest joint leaves the 0.03 mm bound intact"
date: 2026-11-20
tags: [buildbot-sheathing, construction-robotics, humanoid, force-torque-sensor, simulation]
seo_title: "Humanoid nailer: an aimed sensor bias keeps the 0.03 mm bound"
description: "On 3,172 simulated presses, a 0.2 N wrist-sensor bias aimed at the weakest joint leaves a G1 and an H1 nailer at most 0.0203 mm off, inside the 0.03 mm spec."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a wall and land each press within 0.03 mm of where its model says. The hard part is gearbox backlash. A light joint that crosses its friction threshold between plan and press slips through its backlash and moves the nose. The robot plans from a wrist force-torque sensor, and that sensor is wrong by up to about 0.2 N. Since milestone 55 the planner has kept every joint far enough from its threshold to cover the whole 0.2 N error ball, and it lets a joint flip only when the flip's cost at the nose fits inside half the spec.

Each check so far drew the sensor error in six random directions. [Milestone 62](2026-11-20-sheathing-robot-exact-envelope-gate.md) left one question open: would a measured, constant bias behave the same? A real sensor's offset after taring, or its temperature drift, is not drawn at random, and six directions cover a sphere coarsely.

**The test.** Milestone 63 aims the bias. For each standing pose and hose load, it finds the joint the plan leaves closest to its threshold. It then points the 0.2 N bias along that joint's settle gradient, in both signs. To first order no bias in the ball moves that joint further. The robot is the same Unitree G1 or H1 model in MuJoCo, and the planning chain is unchanged. The test ran on 48 new held-out hose loads, alongside six random directions on the same loads. Three hypotheses went into the [project log](../../research/buildbot-sheathing/LOG.md) before the run.

**What came out.**

- **The bound holds.** Across 3,172 aimed-bias cases, no planned press left 0.03 mm at the nose or at the point 44 mm along the nail, in either direction. The worst was 0.0180 mm on the G1 and 0.0203 mm on the H1. Thirty presses flipped a joint between plan and press, and every flip was priced inside the budget.
- **Coverage holds.** The chain planned 1,359 of 1,360 G1 cases and all 1,812 H1 cases. The one refused load sits 0.06 N under its balance limit, inside the 0.5 N band milestone 62 already argued for. The same load also failed two of the random directions.
- **Aimed is not always worse.** On the H1 the aimed bias set a new worst, 0.0203 mm against 0.0182 mm for random directions. On the G1 it did not: 0.0180 mm against 0.0238 mm. That refuted the third hypothesis. The planner already protects the joint the bias was aimed at. What residual is left comes from flips the budget admits on other joints, and a bias aimed at the margin need not excite those.

**What it means.** The random-direction tests of the last eight milestones did not owe their clean record to lucky directions. For an integrator, a constant wrist-sensor offset within the 0.2 N bound is covered whatever its direction, to first order. Two kinds of error would break that: an offset larger than the bound, or one that changes between calibration and press. Those are the next things to measure, with the press's impulse (dynamics, not statics).

**Limits.** One held-out seed. A first-order adversary that aims at the margin rather than searching for the largest residual. A static model, with the 0.5 sole friction not measured. A bias assumed constant from calibration to press. The code, results and figure are in [`experiments/m63_worstbias/`](../../research/buildbot-sheathing/experiments/m63_worstbias/).
