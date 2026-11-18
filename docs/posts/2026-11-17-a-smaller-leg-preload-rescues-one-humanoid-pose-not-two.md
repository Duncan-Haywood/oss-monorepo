---
title: "A smaller leg preload rescues one humanoid nailing pose, not two"
date: 2026-11-17
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, simulation, mujoco]
description: "Cutting a humanoid's leg preload to what its stance allows restores two lost poses, but only one stays inside the 0.02 mm tool-point spec. A held joint is why."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. Its spec plans each stance with a 0.1 N m leg preload and a two-hand squeeze of up to 10 N. The preload keeps the leg joints from crossing their friction band when the force sensor is slightly wrong. The [previous step](2026-11-17-the-zero-press-stance-costs-the-h1-not-the-g1.md) found a problem with the "zero-press" stance, the re-lean that keeps the robot standing when nailer recoil lifts the nose off the wall. On the Unitree H1, two re-leaned poses near the top of its reach, (1.4 m, −0.15 m) and (1.6 m, 0), cannot carry that preload at a 50 N press. The stance allows only 0.033 and 0.095 N m.

Both margins are positive, so the obvious fix is a smaller preload at those two poses. This step ([milestone 44](https://marisstella.app/research/buildbot-sheathing/)) tried it: 0.9 of what each stance allows, which comes to 0.030 and 0.085 N m. The milestone 38 planner runs unchanged otherwise.

## What happened

- **Both poses get a plan back.** Their clean-sheet stacks are 0.9715 and 0.9668, 0.08 and 0.27 points below the old lean. The H1's worst pose is unchanged at 0.9655.
- **The stack ignores the preload's size.** It is identical with no preload, 0.25, 0.5 or 0.9 of the margin. The stack counts loose joints, and a leg constraint met at zero margin holds the joint just as well as one met at 0.1 N m.
- **The residual does not ignore it.** With a 0.2 N sensor error, the H1's worst tool-point error along the wall goes from 0.019 mm to **0.172 mm** at 5 N of hose drag, and from 0.032 to **0.241 mm** at 20 N. It is 0.172 mm even with no hose. Of the 204 swept hose and sensor cases at the two poses, 24 have no plan at all.
- **All of it is one pose.** At (1.6 m, 0) a preload of half the margin or more leaves **0.003 mm**. At (1.4 m, −0.15 m) the residual stays at 0.172 mm. The joint that crosses its friction band there is not a leg joint. It is one of the joints the balance controller already holds, and the leg preload never reaches it.

Two of the five hypotheses registered before the run were refuted: that the plan would survive every swept case, and that the residual would stay under 0.03 mm.

## What a designer takes from it

A per-pose preload rescues (1.6 m, 0). The zero-press stance therefore keeps a spec-grade plan at 4 of the H1's 6 re-leaned poses instead of 3. At (1.4 m, −0.15 m) the residual is nine times the paper's 0.01 to 0.02 mm figure. That is still 18 times inside the ±3.14 mm nail window, but it is not the spec. There it is better to keep the old lean and catch the recoil lift-off another way, or to drop the pose. One untested option is a margin on the held joint itself, and that is a candidate next step.

The result is statics only, with a friction coefficient of 0.5 and the braked waist. The code, results and post hoc are in [`research/buildbot-sheathing/experiments/m44_legpreload`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing/experiments/m44_legpreload).

*Produced with AI assistance (Claude). Simulation only; nothing was tested on hardware.*
