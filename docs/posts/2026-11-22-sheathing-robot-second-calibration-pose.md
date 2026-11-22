---
title: "A second calibration pose doubles a humanoid nailer's tolerance to force-sensor bias"
date: 2026-11-22
tags: [buildbot-sheathing, construction-robotics, humanoid, force-sensing, calibration, simulation]
seo_title: "Humanoid nailer: a second calibration pose doubles bias tolerance"
description: "One extra calibration press lifts the weakest pose's sensor-bias rating from 0.21 to 0.53 N (G1) and 0.28 to 0.56 N (H1) in a simulated humanoid nailer."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a nailer against a sheathed wall and land each press within 0.03 mm of where its model says. [Milestone 68](2026-11-22-sheathing-robot-bias-rating-per-pose.md) found that a single number per pose, a **bias rating**, decides whether a press can be certified against a biased wrist force sensor. The weakest ratings were 0.213 N on the Unitree G1 and 0.279 N on the H1. Both belonged to poses far in height from the one pose where the robot calibrates.

**The idea.** The robot's compensation subtracts the error it measured at its calibration pose from the error it predicts at the press pose. If the bias's effect is linear, as milestone 67 found, then the sensitivity under a different calibration pose is just a subtraction: J(press) minus J(new calibration pose), both read from the table already measured. That means the best calibration poses can be chosen on paper, with no new simulation.

**The plan, made before the run.** Searching every pair of poses in milestone 67's table, the best pair was 0.6 m and 1.0 m grip height on the G1, and 0.8 m and 1.4 m on the H1. Each press is compensated against the nearer of the two. The table predicted the weakest rating would rise to 0.530 N and 0.564 N. Five hypotheses went into the [log](../../research/buildbot-sheathing/LOG.md) before the run. The test ran on 8 new held-out hose loads (seed 69) with two arms: the old single calibration pose and the new pair. Each arm got its own freshly measured sensitivity, its own worst-case aimed bias at 0.3 to 1.0 N, both signs, and its own gate.

**What came out.** All five hypotheses held.

- **Re-referencing is a subtraction.** On every press, the measured sensitivity matched the table's difference to 4 × 10⁻¹⁴ mm/N.
- **The weakest rating more than doubles.** It rose from 0.213 to 0.530 N on the G1 and from 0.279 to 0.564 N on the H1, exactly as planned.
- **The certificate still holds.** No press the gate accepted left 0.03 mm, in either arm, at any bound.
- **Coverage.** At a 0.4 N sensor bound the gate now certifies 100% of G1 and 99.3% of H1 cases, up from 58% and 85% on the same loads. At 0.6 N the figures are 63% and 84%, up from 21% and 52%. At 0.3 and 0.4 N the planner alone, ungated, put no press over spec with two calibration poses.

**What it costs.** One extra calibration press per robot setup, at a second height. The pair also changes which cases count as balanced, because the calibration pose's drag tolerance enters that envelope (216 G1 cases instead of 198). At 1.0 N the H1 planner finds fewer plans with the new pair, so its coverage gain there is smaller (10% to 19%).

**For a practitioner.** If your force sensor's bias is bounded by about 0.4 N, calibrate at two heights rather than one, chosen from a table of four planner runs per pose. That certifies essentially every press on both robots. The same table says three poses would give 0.56 and 0.70 N, and four would give 0.70 and 0.74 N. Those figures were computed, not simulated.

**Limits.** This is simulation only (MuJoCo models of the G1 and H1), in statics, on 8 loads from one seed. The sole friction is not measured. The bias is assumed constant between the calibration and the press, so a drifting sensor is the next test. Code, results and figure: [`experiments/m69_tworef/`](../../research/buildbot-sheathing/experiments/m69_tworef/).
