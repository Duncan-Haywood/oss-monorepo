---
title: "Pick the hold sides per hose load: a humanoid nailer plans every case inside its drag limits"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Hold sides per hose load: a humanoid nailer plans 100% of cases"
description: "Choosing which side of backlash each hold joint sits on per measured hose load lets G1 and H1 humanoids plan every in-envelope press, in spec."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each nail within about 0.03 mm along the wall of where its model says it will. Before each press the planner does two things. It chooses a *hold side* for each joint that carries the load: which side of its gearbox backlash the joint is pushed to, so it cannot rattle across the gap. Then it solves for a leg *preload*, at least 0.1 N m of torque margin on every leg joint, so none of them slips across its own backlash mid-press.

Earlier this afternoon, [milestone 52](2026-11-18-sheathing-robot-calibrate-with-hose-slack.md) left 33 swept cases without a plan. Most were inside the per-pose limits on how hard the nailer's air hose may drag. Milestone 53 asked two questions about them: which of the two steps fails, and does choosing the hold sides from the measured hose load, not once per pose, fix it?

**The setup.** It is the same MuJoCo sweep as before, with the Menagerie Unitree G1 and H1 models. The hose drags at 0, 5 and 20 N in 8 directions, and the wrist force sensor has a 0.2 N error on 6 axes. The calibration is taken with the hose slack. Three hypotheses went into the project log before the run, and two of them were refuted.

**What came out.**

- **The leg preload is the step that fails, not the hold sides (we guessed the opposite).** In 20 of the 26 cases that fail even with a perfect sensor, the hold step solves. But the sides it was given leave only 0.004 to 0.092 N m of leg margin on the G1, and 0.019 to 0.062 N m on the H1, short of the 0.1 N m asked. The joint that runs out is an ankle roll or a hip joint. Only 6 cases fail at the hold step itself.
- **Choosing the sides per load clears them.** The new rule keeps the pose's sides when they plan. When they don't, it searches all the side combinations (64 on the G1, 16 on the H1) at the measured hose load and takes the one with the largest leg margin among those whose full plan solves. That recovers 31 of the 33 cases, with 1.8 to 5.2 N m of margin. On the G1 the usual fix is to flip two joints, the left hip yaw and the left ankle roll.
- **Both robots now plan every case inside the drag limits:** the G1 1368 of 1368 (from 98.1%) and the H1 1902 of 1902 (from 99.7%).
- **Accuracy is unchanged.** The largest recovered residual is 0.0106 mm, so each robot's worst stays at 0.016 mm (G1) and 0.014 mm (H1), inside the 0.03 mm spec.

The two cases left are G1 cases with sensor error at a 0.8 m grip. They sit outside the drag limit at the calibration pose, and no side combination can hold them at the 50 N press.

**The rule set this gives an integrator:**
1. Calibrate once with the hose slack.
2. Keep each press inside its pose's drag limit.
3. Pick the hold sides at each press from the measured hose load.

The robot already plans from the measured load, so step 3 needs no new sensing, only a small search of 16 to 64 quadratic programs per press.

Milestones 46 to 48 chose one side set per pose. This run shows why that kept failing: no single side set holds under every hose load, but one chosen per measured load does.

**Limits.** This is statics only, and the sole friction (μ 0.5) is not measured. The sensor error is a constant bias. Switching hold sides between presses moves joints across their backlash, and its time and wear cost is not modelled.

The run, its results and the figure are in [`experiments/m53_loadside/`](../../research/buildbot-sheathing/experiments/m53_loadside/), and the project's [README](../../research/buildbot-sheathing/README.md) has the full milestone history.
