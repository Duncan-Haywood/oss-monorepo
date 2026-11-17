---
title: "Does a sheathing robot's ledger trick survive a second physics engine?"
date: 2026-11-12
tags: [buildbot-sheathing, construction-robotics, sim-to-sim, drake, mujoco, simulation]
seo_title: "MuJoCo vs Drake: a construction robot result on two contact models"
description: "Rebuilt in Drake, a sheathing robot's ledger seat still squares the sheet; clean sheets move 0.06 points at most. The bowed-edge rock depends on the engine."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails where the code and the panel maker want them. Earlier steps found a cheap way to square the sheet. A laser-set ledger board goes under the sheet, the robot lowers the sheet onto it, lets go and presses lightly against the wall, and the sheet rotates until it sits flat on the ledger. In MuJoCo the sheet ended parallel to the ledger within 0.0001°. Every later step, the cycle time and the dollars per sheet, assumes that result.

All of it came from one simulator. MuJoCo's contacts are soft, and soft contacts can creep where real static friction would hold. The ledger trick is itself a friction question: does wall friction hold the sheet at the robot's error, or does gravity turn it onto the ledger? So this step rebuilt the same scene in **Drake**, Toyota Research Institute's simulator, with its SAP contact solver. It used the same sheet, the same contact points and the same holder controller, applied as an external force each step. We logged five hypotheses before running anything.

- **Clean sheets don't move.** Over 2,000 random seats (holder error up to ±1°, wall friction 0.3 to 0.5, press 5 to 50 N), Drake leaves the sheet 0.0014° off (1σ) and MuJoCo 0.00001°. That is a hundred times more, and still twenty times under the 0.03° a sheet may hang on single 2x joint studs. Fed through the cycle model, all 24 ledger pipelines keep their clean-sheet rate within **0.06 points**. We had allowed 10.
- **The press limit is closer to textbook friction in Drake.** Press too hard and wall friction holds the error. The rigid closed form puts that limit at m g W / (2 μ r̄): 204 N at a friction of 0.4. Drake finds 97–100% of the closed form and MuJoCo 87–99%. In MuJoCo, wall friction starts holding the sheet at up to 13% less press than rigid friction predicts, so MuJoCo is the cautious engine here. All six of the 200 grid cells where the two engines disagree sit right at that limit.
- **Sliding the sheet along the ledger** tips it when pushed above W / (2 μ). Both engines agree with that within 1.6%.
- **One hypothesis failed.** A robot that keeps its wrist stiff while the sheet settles should, by the closed form, keep none of its error when the wrist is soft. Drake keeps up to 0.016°. That is small, but not the zero we predicted. A robot that lets go avoids it.
- **The bowed edge is the open term.** The panel standard lets a sheet's bottom edge bow 1/16 in. Earlier steps charged the full rock that allows, 0.149°. Drake rocks the sheet 0.107–0.123° and MuJoCo 0.139–0.145°. A sheet resting on its bowed middle is balanced, so how far it rocks depends on friction and on how it came down, not on statics. The two engines differ by about the size of the whole single-2x budget. The charged figure is the conservative side.

So the ledger result does not come from MuJoCo's contact model, and the programme can move to the paper draft. The bowed edge stays open: a flexible sheet in simulation, or a real mock-up wall, would settle it.

This is still simulation. Both engines model a rigid sheet on point contacts, and agreeing with each other does not make either one a real sheet on real framing. Drake took 0.11 s a seat and MuJoCo 0.025 s, on four processes. Code, numbers, the figure and the pre-registered plan: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
