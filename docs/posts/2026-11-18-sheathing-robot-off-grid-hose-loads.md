---
title: "Off the grid: random hose loads find 0.28 mm errors a 45-degree sweep never saw"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Random hose loads find humanoid nailer errors a grid sweep missed"
description: "Latin-hypercube hose loads keep a humanoid nailer's planning at 100%, but 4 of 9438 presses leave the 0.03 mm spec in direction windows under 5 degrees wide."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each nail within about 0.03 mm, along the wall, of where its model says it will. Earlier today, [milestone 53](2026-11-18-sheathing-robot-hold-sides-per-hose-load.md) ended with three rules for the nailer's air hose. Calibrate with the hose slack. Keep each press inside its pose's drag limit. Pick the hold sides from the measured hose load. With those rules, the MuJoCo models of the Unitree G1 and H1 had a plan for every swept case inside the drag limits, all in spec.

"Every swept case" had a catch: the sweep was a grid. The hose pulled at 0, 5 or 20 N, in 8 directions 45 degrees apart, and each pose's drag limit was also found only at those 8 directions. Milestone 54 drops the grid and asks whether the rules still hold.

**The setup.** Milestone 53's model, unchanged. 48 hose loads come from a Latin hypercube: 0 to 20 N of drag, in any direction, seed 54. Each load is run at 6 sensor-error axes and every pose, 9792 pose-cases in all. At each sampled direction, each pose's drag limit is bisected with the same test milestone 50 used. Run at the 8 grid directions, that test gives milestone 50's limits exactly, so the two can be compared. Three hypotheses went into the project log before the run. Two were refuted.

**What came out.**

- **Coverage survives.** Inside the drag limits, the G1 plans 4002 of 4002 pose-cases and the H1 5436 of 5436. 116 of them need the per-load hold sides from milestone 53.
- **The spec does not, quite.** 4 of those 9438 planned cases leave 0.03 mm. The worst is **0.284 mm**, nearly ten times the spec, on the G1 at its 0.4 m grip under 13.2 N of drag at 290 degrees. The other three are on the H1 at its 1.2 m grip, 0.032 to 0.042 mm. On the grid, the worst case for either robot was 0.016 mm.
- **The grid's drag limits are slightly optimistic between directions.** At 21 pose-directions, all on the G1 at its low grips with the hose pulling back and to the side, the true limit is up to 2.17 N below what the grid suggests. Those limits are all above 23 N, past the 20 N this sweep reaches. The limits that actually bind (about 4 N for the G1 at 1.2 m, 12 N for the H1 at 1.6 m) point straight back, which is a grid direction, so they match.

**Why the grid missed them.** A post-hoc look (not a registered test) finds the same cause in all four. One joint's torque sits right at the 0.2 N m friction torque at which the model counts a joint as held on one side of its gearbox backlash. The robot plans from the *measured* load, which carries the sensor's error. Under the *true* load, the joint lands on the other side of that threshold: held in the plan and free in reality, or the reverse. That is half a backlash gap of error on one joint, about 7.4e-4 rad. On the G1 the joint is the right shoulder yaw, planned at −0.226 N m and settled at −0.200. On the H1 it is a hip pitch or a knee.

Sweeping the hose direction ±6 degrees around each case puts the over-spec points inside spans 2.75 to 4.75 degrees wide. A 45-degree grid can step right over windows that narrow, and this one did.

**Does milestone 53's rule fix it?** Partly. Re-choosing the hold sides for maximum leg margin brings all three H1 cases inside spec (0.001 to 0.006 mm). It leaves the G1 case at 0.284 mm, because a shoulder is an arm joint, and hold sides only cover hold and leg joints.

**What this means for an integrator.** The three rules still give a plan everywhere inside the drag limits. But a plan that leaves any joint only a few hundredths of a N m from its friction threshold can flip under a 0.2 N sensor error. The next step is to make the planner keep every joint's torque, arms included, far enough from the threshold to cover the sensor error at both ends of the press window, and then rerun these 48 loads and a fresh seed.

**Limits.** Statics only. The sensor error is a constant bias, and the sole friction (μ 0.5) is not measured. 4 in 9438 (0.04%) comes from just 48 loads, so it is a rough estimate.

The run, post hoc, results and figure are in [`experiments/m54_lhs/`](../../research/buildbot-sheathing/experiments/m54_lhs/), and the project's [README](../../research/buildbot-sheathing/README.md) has the full milestone history.
