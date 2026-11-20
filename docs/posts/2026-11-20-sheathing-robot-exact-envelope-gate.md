---
title: "A humanoid nailer's quick balance check turns out to be its planner's exact limit, once hold sides are free"
date: 2026-11-20
tags: [buildbot-sheathing, construction-robotics, humanoid, backlash, simulation]
seo_title: "Humanoid nailer: the balance check is the planner's exact limit"
description: "Searching all 64 or 16 hold-side combinations, a simulated G1 and H1's planner limit matches the balance check to 0.01 N in 1,616 of 1,632 pose-direction pairs."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a pneumatic nailer against a sheathed wall and land each press within 0.03 mm of where its model says. Before it plans a press, the robot runs a quick gate: can its feet and hands balance the 25 N and 50 N presses under the hose's drag at all? That is a small linear program. The planner behind it asks for more. Each light joint (one carrying less than about 0.2 N m) has to sit firmly on a chosen side of its gearbox backlash, with a preload margin, so that a 0.2 N wrist-sensor error cannot flip it.

[Milestone 61](2026-11-20-sheathing-robot-full-coverage-seed.md) found the gate looked too generous. On the pose's own hold sides the planner's limit fell up to 44 N below the balance limit. If that were the real limit, the robot would accept loads it cannot plan. Milestone 61 also suspected that choosing other hold sides would recover most of the gap.

**The test.** Milestone 62 bisects the planner's limit over every hold-side combination: 64 on the Unitree G1 model and 16 on the H1, at every standing pose and every hose direction of 48 new held-out loads. A development probe on the previous seed's directions came first. Three hypotheses went into the [project log](../../research/buildbot-sheathing/LOG.md) before the run.

**What came out.**

- **Hold sides close the gap.** On its own hold sides the planner falls short of the balance limit in 312 of 720 G1 pairs and 110 of 912 H1 pairs, by up to 45 N. Over every combination it matches the balance limit to 0.01 N in 712 G1 pairs and 904 H1 pairs. The only pairs short by more than 0.5 N are 7 on the G1, all at hose loads of 46 to 60 N. The test loads run to 20 N.
- **Everything inside is planned.** The planning chain (milestone 59's bound, milestone 60's leg preload raise, milestone 61's wider squeeze) plans every press inside the balance gate: 3996 of 3996 on the G1 and 5400 of 5400 on the H1. All of them land inside 0.03 mm, the worst at 0.024 mm. This is the second held-out seed in a row with no refused press.
- **The safety band costs a little.** Gating at the planner's limit less 0.5 N drops 12 G1 presses (0.30%). That missed the registered ceiling of 0.3% by a fraction of a press, so that hypothesis is refuted. All 12 are one hose load sitting 0.4 N under its limit, and the chain plans every one of them. With a band of 0 to 0.3 N, nothing is dropped and nothing inside goes unplanned.

**What it means.** The "loose gate" was a hold-side effect, not a planner limit. At working hose loads the cheap balance check is the planner's exact envelope, as long as the planner may pick hold sides for each load, and it already does. That is useful for a practitioner: one small LP per press tells you whether the backlash-aware planner will succeed, with no need to search its 16 to 64 combinations online. Only one earlier seed has shown counter-examples: three G1 cases at one load, 0.32 N inside their limit. The coverage chase can stop here. The open limits that matter more now are dynamics (the press's impulse, not its static force) and a measured sensor bias.

**Limits.** One held-out seed, about 9,400 presses. A static model. The sensor error is a constant random-direction bias, and the 0.5 sole friction is not measured. The bisection assumes each combination's feasibility only gets worse as drag grows. The 0.5 N band is chosen, not derived. The code, results and figure are in [`experiments/m62_exactgate/`](../../research/buildbot-sheathing/experiments/m62_exactgate/).
