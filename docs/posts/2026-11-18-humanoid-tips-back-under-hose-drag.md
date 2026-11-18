---
title: "Not a solver bug: why a nailing humanoid tips back when its air hose pulls"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid, contact-forces, negative-result]
seo_title: "Why a nailing humanoid tips back under air-hose drag"
description: "Eight robot poses had no foot-force plan under a backward air hose. We checked the solvers: the robot was tipping back, and the hose ate 15 N of headroom."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing/) programme asks whether a stock humanoid can hold a nail gun against a wall and land every nail on the studs. Milestone 48 left a loose end. At 8 of 34 poses, no plan existed once 20 N of air-hose drag pulled the arm backward while the gun pressed at 50 N. Those cases were dropped from the accuracy sweep: 17% of the Unitree G1's cases. We read the gap as two solvers disagreeing. The quadratic program that picks foot forces seemed to solve where the linear program that scores leg-joint margins did not.

**The reading was wrong.** Milestone 49 ([`experiments/m49_backload/`](../../research/buildbot-sheathing/experiments/m49_backload/)) re-ran every one of the 24 failing (pose, hose load) cells at both ends of the press range. Its hypotheses were registered first. The two solvers agree everywhere. At a 25 N press both solve: all 984 foot-force solutions balance the robot to 1.7e-13 and score a margin. At a 50 N press neither solves, because nothing can. No set of foot forces balances the robot inside the μ 0.5 friction cones. The best cone slack runs from −23.8 to −0.1 N. Milestone 48's table had printed the 25 N pair beside the 50 N pair, and we had read across them.

**The robot tips; it does not slide.** The soles' net sideways load is at most 0.19 of their vertical load, well inside μ 0.5. At 13 of the G1's 18 cells, even unlimited friction does not balance it. The wall's push plus a backward hose moves the centre of pressure behind the heels.

**Hose drag eats the press window.** Each pose was leaned so its feet can balance any press from 25 to 50 N, but only with no hose attached. We bisected the largest press each pose can balance:

| Robot, grip | No hose | 20 N hose pulling straight back |
|---|---|---|
| G1, 1.2 m | 51.6 N | 36.4 N |
| G1, 1.0 m | 62.2 N | 47.4 N |
| H1, 1.6 m | 58.7 N | 42.8 N |

Each newton of backward drag costs about 0.75 to 0.8 N of press headroom. These poses had only 1.6 to 12 N to spare.

**What it changes.** There is no solver to fix. The fix is a forward lean that leaves room for the hose above 50 N, or a hose run that does not pull back at high grips. Two of the five registered hypotheses were refuted. The other three were never tested, because they only applied if the solver had been at fault. The accuracy figures still cover only the cases a stance can hold. This is a statics model, and μ 0.5 has not been measured for these soles. The numbers, scripts and figure are in the project's [log](../../research/buildbot-sheathing/LOG.md).
