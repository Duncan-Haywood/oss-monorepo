---
title: "One hip joint sets the wrist sensor a nailing humanoid needs"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, force-torque-sensing, mujoco]
description: "A hold-first preload can't rescue the H1's worst nailing pose: the stance caps one hip roll at 0.034 N m, so it needs a sensor with under 0.19 N z error."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. The [previous step](2026-11-17-a-smaller-leg-preload-rescues-one-humanoid-pose-not-two.md) left one pose of the Unitree H1, grip at 1.4 m and 0.15 m to the left, with a 0.172 mm tool-point residual when its wrist force sensor is off by 0.2 N. The spec quotes 0.01 to 0.02 mm. That step's explanation was that the joint flipping there sits outside the leg preload's reach.

This step ([milestone 45](https://marisstella.app/research/buildbot-sheathing/)) checked that explanation, and it was wrong.

## Which joint, and why

The joint is the **right hip roll**. The balance controller holds it, and it is also one of the leg joints the preload acts on. The plan put it 0.030 N m above its friction threshold. With a 0.2 N sensor error along the vertical, it settled 0.033 N m lower, just under the threshold. So the preload did reach it, but the margin was too small.

The obvious fix is to give the held joints their margin first and let the other leg joints take what is left. That is a two-tier preload, now in the programme's library as `tiered.py`. Before the run we registered six hypotheses. The main one was that the stance would allow the held joints at least 0.05 N m once the other legs gave up theirs.

## What happened

- **The hold set has no room.** With every other leg joint allowed down to its own threshold, the hip roll's largest margin is **0.0339 N m**, against 0.0333 under the common rule. The stance itself caps that joint. The other leg joints had 0.19 N m to spare, so they were never the limit.
- **So the residual stays.** It is 0.172 mm at 0, 5 and 20 N of hose drag. The 20 N figure improves from 0.241 mm because the other legs now carry their full 0.1 N m. The clean-sheet stack does not move, and the number of swept cases with no plan is unchanged at 24 of 204.
- **The sensor decides it.** In an unregistered post hoc check, the hip roll moves 0.163 N m per newton of sensor error along z. That keeps the pose inside the spec only while the z error stays below about 0.19 N. The residual is 0.001 to 0.004 mm at 0.05 to 0.15 N of error and 0.172 mm at 0.2 N.

Three hypotheses held (a plan at both poses, no more lost cases, no stack cost). Three were refuted (room on the hold set, rescue of the pose, and the H1's 0.03 mm tool-point bound).

## What a designer takes from it

At this pose the deciding part is the force sensor, not the controller. A sensor at twice an ATI Mini45's 1/16 N resolution (0.125 N, used as a noise proxy) passes. A Robotiq FT 300's two standard deviations of noise (0.2 N) does not. With an FT 300 the zero-press stance keeps a spec-grade plan at 4 of the H1's 6 re-leaned poses, and with the better sensor at 5. If you can't promise the better sensor, keep the old lean at (1.4 m, −0.15 m). A hold-first preload is still worth using elsewhere, since it costs nothing in clean sheets.

The result is statics only, with a friction coefficient of 0.5 and the braked waist. One option not yet tried is to choose a different set of held joints at this pose. The code, results and post hoc are in [`research/buildbot-sheathing/experiments/m45_tiered`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing/experiments/m45_tiered).

*Produced with AI assistance (Claude). Simulation only; nothing was tested on hardware.*
