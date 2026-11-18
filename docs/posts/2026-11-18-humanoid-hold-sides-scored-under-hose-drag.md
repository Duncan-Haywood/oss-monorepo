---
title: "Scoring a humanoid's hold sides under hose drag fixed the G1 and exposed a coverage gap"
seo_title: "Hold sides scored under hose drag: G1 back in spec"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, whole-body-control, mujoco]
description: "Hold sides chosen over 17 hose loads return the G1 to 0.011 mm at 20 N drag, but 17% of its swept cases have no plan at all."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail wall sheathing to code tolerance. To hold still against the nailer, the controller presses a few hip and ankle joints past their friction threshold, each on a chosen side. [The last step](2026-11-18-humanoid-hold-sides-per-pose-help-h1-hurt-g1.md) let every pose pick its own sides, scored with no hose pulling. That helped the Unitree H1 and pushed the Unitree G1 over the 0.03 mm spec at 20 N of hose drag.

This step ([milestone 48](https://marisstella.app/research/buildbot-sheathing/)) scores the sides at the loads the robot meets. At each pose it tries every combination (64 for the G1, 16 for the H1) and keeps the one whose smallest leg margin over 17 hose loads is largest. Those loads are no hose, plus 5 N and 20 N pulling in each of eight directions, each checked at both press ends. Six hypotheses were registered before the run.

## What held

- **The G1 is back in spec.** Its worst tool-point error along the wall, with a 0.2 N wrist-sensor error, is 0.016 / 0.011 / 0.011 mm at 0 / 5 / 20 N of drag. The previous step left it at 0.037 mm at 20 N.
- **The H1 keeps its gain:** 0.010 / 0.014 / 0.010 mm, the same as the previous step.
- **Nothing is lost on a clean sheet.** Each robot's worst no-hose stack is unchanged (G1 0.9257, H1 0.9655).

## What did not

- **Some poses have no good side.** At 8 of 34 poses (the G1 gripping at 1.0 and 1.2 m, the H1 at 1.6 m), no side combination has a plan once 20 N pulls backward during the 50 N press. Those poses keep the old sides.
- **The worst case is not over every case.** A check after the run counted the swept cases the error table skips because the plan has no solution. For the G1 that is 258 of 1,530 pose-cases (17%). At 20 N, 9 of 48 cases drop out at every pose because the calibration pose itself has no plan. The H1 skips 41 of 1,938. So the G1's "0.011 mm at 20 N", here and in the two earlier steps that quoted it, is the worst over the cases it can plan. From now on the table should report coverage beside the worst case.

## What it means for a builder

Scoring hold sides under the loads the robot will meet is the right rule where a plan exists. The open question is the backward hose. The robot's hold solver finds a solution at those loads but the margin solver does not. That is either a real limit (the feet cannot react the press plus the drag) or a solver tolerance gap, and the next step tells them apart. If it is real, the practical fixes are a lighter press, a wider stance, or routing the hose so it never pulls backward. All of this is a quasi-static simulation in MuJoCo of the published Menagerie models, not a hardware test.

Code, results and the registered hypotheses: [`research/buildbot-sheathing`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing), `experiments/m48_loadside/`.
