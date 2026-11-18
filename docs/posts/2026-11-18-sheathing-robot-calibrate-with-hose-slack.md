---
title: "Calibrate with the hose slack: a humanoid nailer's one calibration stops failing under drag"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid, calibration, simulation]
seo_title: "Should a robot nailer calibrate with its air hose slack?"
description: "Calibrating a G1 humanoid's nailer with the air hose slack lifts its planned cases from 93.0% to 98.1% and costs no accuracy. Why the load drops out."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each nail within about 0.03 mm along the wall of where its model says it will. One step in that pipeline is a single calibration: the robot drives one nail at a reference pose (1.0 m high, centred) and uses the error it sees there to correct every other pose.

Milestone 51 this afternoon found a problem with that step. The nailer's air hose drags on the robot, and every pose has a largest drag it can stand without tipping. Inside those per-pose drag limits, a Unitree G1 still had no plan for 96 swept cases, and 75 of them came from the calibration pose. Under a sideways hose pull the calibration move itself had no plan, and since one calibration serves every pose, each of those failures dropped all 15 poses at once.

**The fix we tested.** Calibration is a single move, so the operator can leave the hose slack for it: only the hanging hose's weight acts on the tool. Each working press keeps its full hose load. We reran the same sweep as milestone 51 in MuJoCo with the Menagerie G1 and H1 models: 0, 5 and 20 N of drag in 8 directions, and a 0.2 N wrist force-sensor error on 6 axes. Three hypotheses were registered in the project log before the run.

**What came out.**

- The slack calibration plans at all 6 sensor-error axes on both robots, so the calibration never drops a case.
- Inside the drag limits the G1 now plans 1342 of 1368 cases, **98.1%, up from 93.0%**. Over the whole sweep it plans 91.1%, up from 83.1%. The H1 was already at 99.7% and stays there.
- No residual moved by as much as 0.00005 mm. The worst along the wall is still 0.016 mm on the G1 and 0.014 mm on the H1, inside the 0.03 mm spec.

That last result surprised us at first, so we checked why. The compensator predicts each joint's deflection from the load the wrist force sensor measures. What it misses comes only from the sensor's error, not from the hose. That error is a constant bias here, so the error left at the calibration pose is the same under any hose load. At the G1's calibration pose, the slack and loaded calibration errors differ by about 4e-19 rad on joints whose error is about 1e-5 rad. The calibration's job is to absorb the sensor's bias, not the load.

**The rule this gives an integrator:** calibrate once with the hose slack, then keep each press inside its pose's drag limit. In this model that costs no accuracy.

**What is left.** Thirty-one cases inside the limits still have no plan. On the G1, 21 are plan limits at the 1.0 and 1.2 m grips that fail even with a perfect sensor, and 5 come from sensor error. On the H1, 5 are plan limits at its 1.6 m grip. These are the next step: which hold or leg-preload constraint binds, and whether choosing the hold sides per hose load clears them.

**Limits.** Statics only, and the sole friction (μ 0.5) is not measured. The sensor error is modelled as a constant bias. A gain (scale) error, or windup that is not linear in torque, would make the calibration depend on the load, and neither is modelled.

The run, its results and the figure are in [`experiments/m52_slackcal/`](../../research/buildbot-sheathing/experiments/m52_slackcal/), and the project's [README](../../research/buildbot-sheathing/README.md) has the full milestone history.
