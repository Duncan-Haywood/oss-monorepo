---
title: "Choosing a humanoid's hold sides per pose helped the H1 and pushed the G1 over spec"
seo_title: "Per-pose hold sides: H1 nailing error down, G1 up"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, whole-body-control, mujoco]
description: "Per-pose hold sides cut the H1's worst nailing residual at 20 N hose drag from 0.032 to 0.010 mm, but raised the G1's from 0.011 to 0.037 mm."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. To hold its pose against the nailer, the controller keeps a few hip and ankle joints pressed past their friction threshold, each on a chosen side. Until now each robot used one set of sides at every pose. [The last step](2026-11-18-humanoid-hip-roll-held-on-wrong-side-not-a-sensor-limit.md) found that set was wrong at one Unitree H1 pose and disagreed with the torque-minimising plan at four more.

This step ([milestone 47](https://marisstella.app/research/buildbot-sheathing/)) lets every pose pick its own sides. At each pose of both robots it tries every combination (16 for the H1's four held joints, 64 for the Unitree G1's six). It keeps the one that leaves the most torque margin on the legs, measured with no hose pulling and a perfect wrist sensor.

## What changed

- **Every pose clears the preload goal.** The smallest leg margin over both robots is 0.886 N m, against the 0.111 N m the spec's preload needs. Before, it was 0.033 N m at the H1's worst pose.
- **Two H1 poses get a plan.** Gripping at 0.4 m and 1.6 m height, 0.15 m to the left, the H1 had no way to hold its stance on the old sides. On per-pose sides both do, with margins of 12.8 and 6.6 N m. They are not in the error sweep yet.
- **The H1 gets more accurate.** With a 0.2 N wrist-sensor error (a Robotiq FT 300 class figure), the H1's worst tool-point error along the wall at 20 N of hose drag falls from 0.032 mm to 0.010 mm. The spec is 0.03 mm at up to 5 N of drag.
- **Nothing is lost on a clean sheet.** Every pose's no-hose stack is within 0.01 points of before.

## What went wrong

The G1 got worse. Its worst error at 20 N of drag rose from 0.011 mm to 0.037 mm, over the 0.03 mm line. A check run after the experiment confirms the code reproduces the G1's old numbers exactly on its old sides. The rise comes from three of its 15 poses. At each, one leg joint that is not one of the held joints slips across its threshold once the hose pulls.

The cause is the score. Margin measured with no hose force says nothing about margin under drag, and on the G1 the sides that widen one shrink the other. Five of the six registered hypotheses held; the one on the G1 did not.

## What it means for a builder

Choosing hold sides per pose is worth doing on the H1. It rescues poses and cuts the worst error by two thirds. But the controller should score sides at the loads the robot will actually meet, hose drag and sensor error included, not at rest. That is the next step. All of this is a quasi-static simulation in MuJoCo of the published Menagerie models, not a hardware test.

Code, results and the registered hypotheses: [`research/buildbot-sheathing`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing), `experiments/m47_poseside/`.
