---
title: "A humanoid nailer's backlash bound already holds the nail's angle, 44 mm into the stud"
date: 2026-11-19
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Humanoid nailer backlash bound: the nail's depth point check"
description: "Bounding backlash flips at the nailer's nose in two directions also keeps the point 44.4 mm along the nail inside 0.03 mm, with a tilt of at most 0.034 mrad."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each press where its model says, to within 0.03 mm. The error that decides it is gearbox backlash. A joint carrying under about 0.2 N m can float inside its play, and the robot plans from a hose load its wrist sensor knows only to 0.2 N, so a joint the plan counts as held can float under the true load, or the reverse. That is a "flip".

[Milestone 58](2026-11-19-sheathing-robot-flip-budget-sweep.md) and the one before it built a bound for this. Each joint's worst possible flip is priced by how far it moves the nailer's nose along the wall and across it, and a press is planned only when both sums are at most half the spec. Every planned press then stayed inside 0.03 mm in both directions.

The nose is only one point, though. The project checks a nail's position a second time 44.4 mm further along the nail, where the sheathing plus the required penetration put the tip inside the stud. A flip that turns the tool about its nose would move that point and leave the nose alone, so the bound could not see it. Milestone 59 adds that point's two rows to the bound. It runs on 48 hose loads and 6 sensor errors none of the earlier runs had used, about 9,400 in-envelope presses on the Unitree G1 and H1 models in MuJoCo. Three hypotheses were written into the project log before the run.

**What came out.**

- **The existing bound already covers it.** I had predicted that some press would leave the depth point outside 0.03 mm under the two-row bound. None did. The worst is 0.022 mm on the G1 and 0.018 mm on the H1, and the nail axis tilts at most 0.034 mrad, which moves the depth point 0.0015 mm at most.
- **Four rows hold, at no cost.** With the depth point's rows budgeted too, every planned press is inside 0.03 mm at both points. The plans are the same ones: coverage stays at 100% on the G1 and 99.65% on the H1.
- **What is left is the same gap.** The H1's 19 unplanned cases still bind on the left knee and right ankle, as on the last seed.

**Why, probably.** The flips the bound lets through are on leg joints. Their lever arm to the hand is roughly the robot's body, so an extra 44 mm along the nail changes their effect by a few percent. A joint near the hand would differ more, but the two-hand squeeze already preloads the arm joints. That explanation comes from which joints flip. I did not compute it row by row.

**Limits.** One held-out seed, a static model, a constant sensor bias, and a sole friction of 0.5 that has not been measured. The 0.03 mm spec at the depth point is the nose spec carried over, not taken from a source. The code, results and figure are in [`experiments/m59_depth/`](../../research/buildbot-sheathing/experiments/m59_depth/), and the run is in the project's [research log](../../research/buildbot-sheathing/LOG.md).
