---
title: "A sensor-sized margin fixes a humanoid nailer's backlash misses, and costs 3 to 4% of its presses"
date: 2026-11-19
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Sensor-sized torque margin fixes humanoid nailer backlash errors"
description: "A torque margin sized from a 0.2 N sensor bound keeps every planned humanoid nail press in a 0.03 mm spec, but drops 3 to 4% of presses, mostly at the waist."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each nail within about 0.03 mm, along the wall, of where its model says it will. Yesterday, [milestone 54](2026-11-18-sheathing-robot-off-grid-hose-loads.md) sampled the nailer hose's pull at 48 random loads instead of a grid. The MuJoCo models of the Unitree G1 and H1 still had a plan for every case inside the drag limits. But 4 of 9438 cases missed the spec, the worst by 0.284 mm.

All four misses had the same cause. Each joint gearbox has a little backlash. A joint carrying more than about 0.2 N m of torque sits pressed against one side of that play, and a joint below it can float. The robot plans its press from the hose load its wrist sensor measures, but that sensor can be off by up to 0.2 N. In each miss, one joint's planned torque sat a few hundredths of a newton metre from 0.2 N m. The plan counted it as held; under the true load it floated, or the other way round. That cost half a backlash gap on one joint.

**The fix tested.** Milestone 55 asks for a safety margin around that threshold. The code made it easy to size. The robot's planned-to-settled torque change is linear in the load error (checked to 2e-13 N m). So for each joint there is a worst-case change under any 0.2 N sensor error. Call it r. The robust rule plans a press only if every joint's torque, at both ends of the press, is more than r away from 0.2 N m. If a joint is too close, the rule first re-chooses how hard the two hands squeeze the tool, then which side of its backlash each leg joint is held on. If neither works, the press gets no plan. Three hypotheses were registered in the project log before the run. One held.

**What came out.**

- **The spec holds.** On milestone 54's 48 loads, every case the robust rule plans is inside spec. The worst is 0.0107 mm on the G1 and 0.0099 mm on the H1, down from 0.284 and 0.042 mm. Across 18,119 planned cases, no joint's held state differs between plan and robot. All four old misses now plan inside spec.
- **The margin is large.** For some joints, r reaches 0.27 N m, more than the 0.2 N m threshold itself. Such a joint cannot be safely left free, so it has to be held hard.
- **Coverage drops.** The robust rule plans 96.4% of in-envelope cases on the G1 and 96.6% on the H1, against 100% before. On 48 fresh loads, with sensor errors in random directions, it plans 95.9% and 96.8%.
- **The waist is the problem.** Of the 667 dropped cases, 291 of the G1's 308 fail on a waist joint and 281 of the H1's 359 on its torso joint. Nothing in the plan can move those torques. The leg preload and hold sides only change the leg torques, and the squeeze has no net effect on the body.
- **The rule is too strict.** On the fresh loads, the old rule had no misses (worst 0.029 mm), and every case the new rule dropped was in spec under the old one. A flipped waist joint moves the nailer's nose less than the spec allows here.

**What it means for a builder.** Sizing a margin from the sensor's error bound works: it removes the backlash flips by construction, and a robot can compute it from the measured load alone. Applying it to every joint costs 3 to 4% of presses to prevent errors that, on the joints doing the dropping, would not have mattered. The next step is to weight the margin by what a flip actually costs at the nose. Require it only where half a backlash gap would move the nail point by a set share of the spec. The alternative is to give the waist a preload of its own.

**Limits.** These are static models, with the sensor error a constant bias. Friction μ = 0.5 was not measured for these feet. The side search, up to 64 small optimisation problems per press, was run offline, not timed on a robot.

The code, results and figure are in [`experiments/m55_robust/`](../../research/buildbot-sheathing/experiments/m55_robust), and the log entry, with the hypotheses as registered, is in [`LOG.md`](../../research/buildbot-sheathing/LOG.md).
