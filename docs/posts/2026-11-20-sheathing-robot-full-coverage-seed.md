---
title: "A simulated humanoid nailer plans every in-envelope press on a new seed, and its envelope test is too generous"
date: 2026-11-20
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Humanoid nailer backlash: full coverage on a held-out seed"
description: "With a per-press leg preload, a simulated G1 and H1 plan all 9,486 held-out nailer presses within 0.03 mm, but the balance envelope gate is up to 44 N loose."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each press within 0.03 mm of where its model says. The error it chases is backlash: a gearbox carrying less than about 0.2 N m can float inside its play, and the robot plans from a hose load its wrist sensor reads only to within 0.2 N. When a joint the plan counts as held floats under the true load, or the reverse, that is a "flip". The planner prices every possible flip and refuses a press whose flips could move the nail too far.

[Milestone 60](2026-11-19-sheathing-robot-raised-leg-preload.md) raised the leg preload for each refused press and got the Unitree H1 model from 99.67% to 99.98% coverage. Four presses stayed refused on that seed. One H1 press bound on an elbow, which a leg preload cannot reach. Three G1 presses, all at one hose load, had no force plan on any hold side.

**A probe first.** Before writing hypotheses, milestone 61 probed those four presses on the old seed (not held out). The elbow press plans if the two-hand squeeze, which preloads the arm joints, may go to 12.5 N instead of 10 N. The 10 N bound was never a hardware limit: milestone 38 picked it as the smallest squeeze that gave its lowest residual. The G1 presses pointed somewhere less comfortable. The test that decides whether a hose load is "in the envelope" is a balance check: can the feet and hand carry the 25 N and 50 N presses at all? The planner asks more. It wants the light joints held on chosen sides, under their holding threshold, with the leg preload margin. Along the G1 presses' direction the planner's own limit was 5.66 N where the balance test allowed 6.55 N.

Three hypotheses went into the [project log](../../research/buildbot-sheathing/LOG.md) before the run. A wider squeeze (up to 20 N) plans any arm-bound press. Every press with no force plan lies within 0.5 N of the planner's limit or past it. With the gate set at the planner's limit less 0.5 N, the chain plans every press.

**What came out.** The test set was new: 48 hose loads and 6 sensor errors, about 9,500 presses on the G1 and H1 models in MuJoCo.

- **Every in-envelope press planned.** The G1 planned 4050 of 4050 with the rule alone. The H1 planned 5423 of 5436 with the rule and the other 13 with the leg preload raise (0.12 to 0.18 N m). All are inside 0.03 mm at the nail's nose and 44.4 mm along it (worst 0.0136 mm), with no flip between plan and robot. This is the first held-out seed with no refused press.
- **The two leftover mechanisms did not recur.** No press needed the wider squeeze, and none lacked a force plan. Those two hypotheses could not be tested on this seed. The probe's findings stay one-seed observations.
- **The envelope gate is too generous.** Across every pose and the 48 directions, the planner's limit on the pose's own hold sides falls below the balance limit in 314 of 720 G1 and 115 of 912 H1 pairs, by up to 31 N on the G1 and 44 N on the H1. The gaps sit in two bands of hose direction. Most of those loads still plan because the planner can switch hold sides for one press. A gate set at the planner's own limit less 0.5 N would have excluded 48 G1 and 42 H1 presses that the chain in fact planned.

**What it means.** The coverage chase has reached its tail. On the last three seeds the bound refused 19 to 21 presses in about 9,400 before any escalation. After the leg raise, 4 were left on one seed and none on this one, and each of the four came from a rare cause. The weak point now is the gate, not the planner. It admits loads the planner can hold only by switching sides, and on the previous seed three it could not hold at all. A gate built from the planner's own limit over every hold-side combination would say exactly which loads a press can take.

**Limits.** One held-out seed. The model is static, the sensor error is a constant bias, and the sole friction of 0.5 is not measured. The planner's limit was measured on the pose's own hold sides only. The squeeze ladder and the 0.5 N band were chosen, not derived. The grip and arm-heating cost of a wider squeeze is not modelled. The code, results and figure are in [`experiments/m61_lastfour/`](../../research/buildbot-sheathing/experiments/m61_lastfour/).
