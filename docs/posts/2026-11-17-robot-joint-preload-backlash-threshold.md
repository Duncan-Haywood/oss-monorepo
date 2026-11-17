---
title: "A leg-joint preload buys back a nailing robot's backlash accuracy, up to the arms"
date: 2026-11-17
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, backlash, digital-twin]
seo_title: "Does a joint preload fix a humanoid's backlash compensation?"
description: "A 0.1 N m preload on a humanoid's leg joints cuts the hose-drag stack loss from 56.5 to 1.6 points. The 0.3-0.8 mm left is in the waist and arms."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. Yesterday's milestone put a force-torque sensor at the robot's wrist, so the backlash compensator could see the pull of the nail gun's air hose. That fixed most of the error, but it left a floor of 0.3 to 0.8 mm. A few joints sit right at the torque where a joint stops being held against one side of its gear backlash, and any sensor error predicts them on the wrong side.

Milestone 37 tries the obvious cure: a preload. A humanoid standing on two feet can shift load between its legs without changing the net force on the floor. So its balance controller can push each leg joint's torque at least a margin clear of that threshold.

**A stricter error model first.** Milestone 36 assumed the robot's torques came from the controller re-solving under the true hose force, as if it knew that force. Here the controller plans once, from the measured force, and the robot then settles under the true one. We model the settling as the smallest change in contact forces that keeps the robot balanced. That is a stand-in for the joint-level feedback, not a measurement.

**What the numbers say** (Unitree G1 and H1 models in MuJoCo, 35 poses leaned into the wall, a Robotiq FT 300 with 0.2 N of error, statics only):

- **Without a preload, the stricter model costs a lot.** At a 5 N hose drag the G1's worst residual along the wall is 1.38 mm, against 0.82 mm under milestone 36's model. With the drag anywhere in 0 to 20 N, the worst pose loses 56.5 points of clean sheets, not 1.6.
- **The controller causes it.** The balance controller holds its chosen leg joints exactly at the threshold, because that is where its constraint stops binding. Any unmeasured force then tips them over. Those joints make up 161 of the 175 mispredicted cases (92%).
- **A 0.1 N m preload removes every one of them.** The results come back to milestone 36's figures: 0.83 mm at 5 N, and 1.64 points lost over 0 to 20 N. It costs 1.7% more leg torque and one of the G1's 15 poses.
- **It does not get under 0.1 mm.** What is left comes from waist and arm joints at the threshold. No choice of ground reaction can move their torque, because the tool's own wrench sets it. A larger margin changes nothing.
- **Two other ideas fail.** A hedged compensator, which subtracts a quarter of the gap near the threshold instead of half, doesn't halve the error. The FT 300's pre-2017 version, with 1.2 N of noise, still leaves 1.35 mm, preload or not.

Of the five hypotheses we registered before the run, two held and three were refuted.

**What a spec should say.** If the robot uses model-based backlash compensation, its balance controller should hold every leg joint a margin clear of the threshold. Here that margin is about half the threshold, 0.1 N m. The arms need a different preload, for instance a squeeze between two hands on the tool, or joints with less backlash. One caveat: the 0.2 N m threshold and its sharp edge come from our own model, not a datasheet.

Code, results and the paper draft: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
