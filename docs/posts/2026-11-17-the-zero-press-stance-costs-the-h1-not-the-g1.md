---
title: "A robot stance that survives nail-gun recoil: its cost depends on which torques you score"
date: 2026-11-17
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, simulation, mujoco]
seo_title: "Humanoid nailing stance: the cost depends on the torque model"
description: "Re-scored with the plan's own preload and squeeze, a zero-press humanoid stance gains the G1 a point of clean sheets but costs the H1 half its high poses."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. Two milestones earlier, it found that a nailer's recoil can lift the nose off the wall. At 12 of 35 poses the robot then leans on nothing, because it was balanced against the press. Leaning 10 to 39 mm less fixes that: every one of those stances then stands at zero press and still takes 50 N. The reported price was 1.3 points of clean sheets on the Unitree G1 at the top of its reach, and the next step traced all of that to the lean.

Both of those numbers were scored with the balance controller's bare torques. The spec the paper recommends does more than that: it adds a 0.1 N m leg preload and a two-hand squeeze of up to 10 N, both re-planned for each stance. So this step ([milestone 43](https://marisstella.app/research/buildbot-sheathing/)) re-scored the zero-press stance with the spec's own plan.

## What changed

- **The G1 comes out ahead.** With the braked waist, its worst-pose no-hose stack rises from 0.9160 to **0.9257** (+0.97 points). With the stock waist it rises from 0.9081 to 0.9257. The comparison is like for like: every pose the old lean could plan is planned again, plus one it could not. At the old worst pose, the two scoring conventions now differ by 2.70 points (0.9300 against 0.9030). On the old lean they had agreed exactly.
- **The H1 pays instead, in poses rather than points.** Of the Unitree H1's six re-leaned poses at 1.4 to 1.6 m, one had already lost its controller. Two more keep a controller but have no spec plan. The three that remain lose only 0.09 to 0.22 points.
- **Why those two drop.** The balance QP still solves at both ends of the press window. What fails is the leg preload at 50 N: those stances allow at most **0.033** and **0.095 N m**, short of the 0.1 N m the spec asks for. The same check explains the G1's extra pose: on its old lean it allowed 0.088 N m at 50 N, and after the re-lean it allows 0.707.

Two of the five hypotheses registered before the run were refuted: that the two conventions would agree at the worst pose, and that every pose would keep a plan.

## What a designer takes from it

The zero-press stance is not a clean-sheet tax on the G1 once the preload and squeeze are re-planned for it. The binding constraint is the H1's leg preload near the top of the wall. A per-pose preload looks like the obvious next try, because both margins are positive, but its cost in residual error has not been measured. The other options are to cap the press or to keep the old lean there.

The result is statics only, at zero hose force and with an exact force sensor. The residuals along the wall come from milestone 41. The code, results and post hoc check are in [`research/buildbot-sheathing/experiments/m43_specstack`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing/experiments/m43_specstack).

*Produced with AI assistance (Claude). Simulation only; nothing was tested on hardware.*
