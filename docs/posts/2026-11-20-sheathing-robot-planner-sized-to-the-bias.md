---
title: "Sizing a humanoid nailer's planner to its sensor bias works up to 0.3 N, then a different error takes over"
date: 2026-11-20
tags: [buildbot-sheathing, construction-robotics, humanoid, force-sensing, simulation]
seo_title: "Humanoid nailer: planner sized to sensor bias, and where it fails"
description: "Sizing a simulated G1 and H1 nailing planner to a 0.3 N wrist-sensor bias keeps every press within 0.03 mm, but from 0.4 N the bias's direct effect breaks it."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a nailer against a sheathed wall and land each press within 0.03 mm of where its model says. The planner reads the air hose's pull from a wrist force sensor, and every safety margin it keeps is sized to a sensor bias of at most 0.2 N.

[Milestone 64](2026-11-20-sheathing-robot-bias-past-the-bound.md) showed that bound is a cliff. With the planner still sized to 0.2 N, a 0.3 N bias aimed at the weakest joint sent 22.6% of planned G1 presses and 12.0% of planned H1 presses past 0.03 mm, and the planner kept planning as confidently as before.

The obvious remedy, if your sensor drifts more than 0.2 N, is to size the planner to the drift you really have. That costs coverage, the presses the planner refuses. Milestone 65 measured how much, and whether the remedy works.

**Three hypotheses went into the [log](../../research/buildbot-sheathing/LOG.md) before the run.** Sized to the bias, from 0.3 to 1.0 N, every planned press stays within 0.03 mm. Coverage at 0.3 N is at least 95%. Coverage at 1.0 N falls under 80% on at least one robot.

**What came out.** On 12 new held-out hose loads (seed 65; 48 were planned, and the run had to be cut to fit a 2-hour job limit), with every margin sized to B and the true bias B along the worst direction:

- **At 0.3 N the fix is close to free.** No planned press leaves 0.03 mm (worst 0.027 mm on the G1, 0.029 mm on the H1), and the planner still plans 100% of G1 and 99.1% of H1 cases. The second hypothesis held.
- **From 0.4 N it stops working.** At 0.4 N, 2.5% of planned H1 presses leave the spec. At 0.6 N, 23.8% (G1) and 12.0% (H1) do, and at 1.0 N 47 to 48% on both. The first hypothesis is refuted. The worst press at 1.0 N is still six to eight times better than with the 0.2 N planner (0.073 and 0.094 mm against 0.60 and 0.63 mm).
- **Coverage is not the cost.** At 1.0 N the planner still plans 97.9% of G1 and 85.6% of H1 cases. The third hypothesis is refuted.

**Why it fails: not flips.** Every margin in this planner exists to stop "flips", gear backlash changing sides between plan and robot. Re-sizing does its job there: 465 of the 485 failing presses have no flip at all. What is left is the bias's direct effect. A wrong force reading bends the robot's compliant joints by a wrong amount, and the planner's error budget never counted that. The worst residual grows almost linearly with the bias, about 0.075 to 0.097 mm per newton. At 0.2 N that came to about 0.02 mm, under the 0.03 mm spec, which is why every earlier test passed.

**What it means for a practitioner.** If your wrist sensor holds its bias to 0.3 N, size the planner to 0.3 N and you lose under 1% of presses. Past about 0.31 N (H1) or 0.40 N (G1), re-sizing alone is not enough. You need a better sensor, or a planner that also budgets the direct term, the bias times the gain from load error to nose error. Testing that budget is the next milestone.

**Limits.** Simulation only (MuJoCo models of the Unitree G1 and H1), statics, 12 loads on one seed, a sole friction of 0.5 that is not measured, and an adversary aimed at the weakest joint's margin rather than at the direct term, so a bias aimed at the direct term would fail sooner. Code, results and figure: [`experiments/m65_resized/`](../../research/buildbot-sheathing/experiments/m65_resized/).
