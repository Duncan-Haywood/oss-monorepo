---
title: "Giving a humanoid nailer's backlash flips half the accuracy budget bought nothing on fresh loads"
date: 2026-11-19
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Humanoid nailer backlash budget: a sweep on held-out loads"
description: "A flip budget of half a 0.03 mm spec holds on new hose loads, adds no coverage over a zero budget, and the flips it allows move the nose 0.28 mm off-axis."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each press within 0.03 mm, along the wall, of where its model says. The error that matters is backlash. A gearbox carrying less than about 0.2 N m of torque can float inside its play, and the robot plans from a hose load its wrist sensor measures to within 0.2 N. A joint that the plan counts as held can float under the true load, or the reverse. That is a "flip".

[Milestone 56](2026-11-19-sheathing-robot-flip-cost-margin.md), earlier today, priced each possible flip by how far it moves the nose along the wall, summed the prices into a bound Y, and planned a press only when Y was at most half the spec. The other half was left for gear windup and the calibration. The split was chosen before that run and not tuned. Milestone 57 sweeps it on a set of loads none of the earlier runs had seen: 48 new hose loads and 6 new sensor errors, about 9,400 in-envelope presses across the Unitree G1 and H1 models in MuJoCo. Three hypotheses were registered in the project log before the run.

**What came out.**

- **Half the spec replicates.** At a budget share of 0.5, every planned press stays inside 0.03 mm (worst 0.0178 mm), coverage is 99.93% on the G1 and 99.54% on the H1, and the bound is never beaten.
- **The budget buys no coverage until 0.75.** Shares of 0, 0.25 and 0.5 plan exactly the same presses on both robots. At 0.75 the H1 also gets its last 25 presses, all of which bind on the left knee.
- **The whole spec is too much.** At a share of 1, one H1 press leaves 0.0315 mm. The bound held there. It just used all 0.03 mm, and windup adds on top, which is why the split exists.
- **The allowed flips are not free.** Every flip the budget lets through is on a knee or ankle pitch joint. Those joints pitch the body, and at these poses they move the nose very little along the wall and 0.27 to 0.29 mm in the tool frame's other direction across the wall face (z). The rule never looks at that direction. With a zero budget, the worst error in z is 0.026 mm.

**What it means.** On this load set, a zero budget dominates. It plans every press half the spec does, with the same or a smaller worst error along the wall and about a tenth of the worst error in z. A bound that prices flips in one direction treats a joint as cheap when it is only cheap in that direction. The fix is the same construction with one more row of the nose Jacobian: price each flip along and across the wall, each with its own budget.

**Limits.** One held-out seed. The tolerance a press needs in z is not set yet, so whether 0.3 mm matters depends on what the press is lining up to. The model is static, the sensor error is a constant bias, and the sole friction of 0.5 is not measured. The code, results and figure are in [`experiments/m57_beta/`](../../research/buildbot-sheathing/experiments/m57_beta/), and the run is in the project's [research log](../../research/buildbot-sheathing/LOG.md).
