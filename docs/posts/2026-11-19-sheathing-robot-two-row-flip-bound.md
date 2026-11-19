---
title: "Pricing a humanoid nailer's backlash flips in two directions cuts off-axis error tenfold, losing no presses"
date: 2026-11-19
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Humanoid nailer backlash: a two-direction flip bound"
description: "Bounding each backlash flip along and across the wall keeps every simulated press within 0.03 mm both ways, from 0.29 mm off-axis, with no presses lost."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each press within 0.03 mm of where its model says. The error it has been chasing is backlash. A gearbox carrying less than about 0.2 N m of torque can float inside its play, and the robot plans from a hose load its wrist sensor reads to within 0.2 N. A joint the plan counts as held can float under the true load, or the reverse. That is a "flip".

[Milestone 56](2026-11-19-sheathing-robot-flip-cost-margin.md) priced every possible flip by how far it moves the nose along the wall and planned a press only when the sum stayed under half the spec. [Milestone 57](2026-11-19-sheathing-robot-flip-budget-sweep.md) found the catch. The flips that bound let through were knee and ankle pitch joints, which barely move the nose along the wall and move it 0.27 to 0.29 mm across it. The bound never looked in that direction.

Milestone 58 adds the missing row. Each joint's flip is now priced through both in-plane rows of the nose Jacobian, along the wall and across it, each with half of a 0.03 mm spec. The squeeze and the choice of which side each light joint is held on minimise the larger of the two. The test set is new: 48 hose loads and 6 sensor errors no earlier run had seen, about 9,400 presses across the Unitree G1 and H1 models in MuJoCo. Three hypotheses went into the project log before the run, and all three held.

**What came out.**

- **The problem replicates.** The along-the-wall bound alone again keeps every press inside 0.03 mm along the wall, and again leaves 4 G1 and 5 H1 presses over 0.03 mm across it (worst 0.27 and 0.29 mm).
- **Two rows fix it.** With both rows, every planned press is inside 0.03 mm in both directions. The worst across the wall is 0.022 mm on the G1 and 0.018 mm on the H1. Both bounds were at least the shift the robot's flips actually made in every case.
- **Nothing is lost.** Coverage is 100% on the G1 and 99.63% on the H1 under both rules. The second row changes which hold sides and squeeze the planner picks, not whether a plan exists: per-load side changes rise from 250 to 311 on the G1.
- **The z budget does not bind.** A ten times looser across-wall budget (a 0.3 mm spec) picks the same plans. Wherever a z-costly flip was admitted before, a plan without one existed.

**What it means.** The 0.28 mm off-axis error was not a price paid for coverage. It came from an objective that could not tell two plans apart. Once the bound sees both directions, the planner certifies the press position in the wall plane at no cost.

**Limits.** One more held-out seed. The across-wall spec is the along-wall one carried over, not taken from a source. The model is static, the sensor error is a constant bias, and the sole friction of 0.5 is not measured. The press angle (the depth point) is not yet bounded. The code, results and figure are in [`experiments/m58_tworow/`](../../research/buildbot-sheathing/experiments/m58_tworow/), and the run is in the project's [research log](../../research/buildbot-sheathing/LOG.md).
