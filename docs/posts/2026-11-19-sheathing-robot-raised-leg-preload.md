---
title: "A slightly stronger leg preload plans 17 of the 18 presses a humanoid nailer's flip bound refused"
date: 2026-11-19
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Humanoid nailer backlash: raising the leg preload per press"
description: "Raising a simulated humanoid's leg preload from 0.1 to 0.12-0.18 N m plans 17 of 18 refused nailer presses in spec, at a median 0.1% more leg effort."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each press within 0.03 mm of where its model says. The error it has been chasing is backlash. A gearbox carrying less than about 0.2 N m of torque can float inside its play. The robot also plans from a hose load its wrist sensor reads only to within 0.2 N. So a joint the plan counts as held can float under the true load, or the reverse. That is a "flip".

The last three milestones built a bound that prices every possible flip by how far it moves the nail. [Milestone 58](2026-11-19-sheathing-robot-two-row-flip-bound.md) priced flips along and across the wall. [Milestone 59](2026-11-19-sheathing-robot-nail-angle-bound.md) added the point 44.4 mm along the nail. The planner accepts a press only when the bound stays under half the spec. That left about 20 of 5,400 in-envelope presses on the Unitree H1 model with no plan, on two seeds. They all bound on a knee or an ankle at the tallest poses.

Milestone 60 asks whether those presses need a new pose or just a stronger preload. The robot's balance controller can choose its ground reaction forces, so it can push every leg joint's torque away from the holding threshold. Milestone 37 set that margin at 0.1 N m. For each refused press, this run raised it up a ladder (0.12, 0.14, 0.16, 0.18 N m and beyond), in two ways: on every leg joint, or on the joint that binds. The test set was again new: 48 hose loads and 6 sensor errors, about 9,400 presses on the G1 and H1 models in MuJoCo. Three hypotheses went into the project log before the run, written from a development probe on the previous seed.

**What came out.**

- **17 of the H1's 18 refused presses now plan.** All 17 bound on the left knee. They plan at 0.12 N m at the 1.2 m pose, 0.16 at 1.4 m and 0.18 at 1.6 m: the taller the reach, the more margin the knee needs. Every one stays inside 0.03 mm at the nose and the depth point (worst 0.018 mm), with no flip between plan and robot. H1 coverage rises from 99.67% to 99.98%.
- **It costs little.** The controller's leg effort (sum of squared leg torques) rises by a median 0.1%, and by 13% at the 1.6 m pose.
- **Four presses stay refused.** One H1 press binds on an elbow, which no leg preload reaches. Three G1 presses at a single hose load have no plan on any hold side. So the hypothesis that the raise plans every refused press failed.
- **One joint was enough this time.** Raising only the left knee planned the same 17. On the development seed the right-ankle cases needed every leg raised, but none occurred on this seed, so that hypothesis failed too.

**What it means.** The H1's last coverage gap was a preload setting, not a geometry limit. The tall poses push the left knee toward its holding threshold, and a margin set once for all poses is too small there. A margin chosen per press fixes that cheaply. There is little room left at the top, though. At 0.18 N m the tallest pose is one step below the point (0.2 N m) where a free leg joint can no longer take its margin.

**Limits.** One held-out seed. The model is static, the sensor error is a constant bias, and the sole friction of 0.5 is not measured. The ladder's steps were chosen, not tuned. Motor heating from the higher preload is not modelled, and re-posing was not tried. The code, results and figure are in [`experiments/m60_jointpreload/`](../../research/buildbot-sheathing/experiments/m60_jointpreload/), and the run is in the project's [research log](../../research/buildbot-sheathing/LOG.md).
