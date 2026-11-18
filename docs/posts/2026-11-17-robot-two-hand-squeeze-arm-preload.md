---
title: "A two-hand squeeze clears a nailing robot's arm backlash errors, down to the waist"
date: 2026-11-17
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, backlash, digital-twin]
seo_title: "Can a two-hand squeeze preload a humanoid's arm joints?"
description: "Squeezing the nail gun between two hands moves only the arm joints. It clears every arm backlash flip and takes 0-20 N of hose drag to 0.05 points lost."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. This morning's milestone held the robot's leg joints 0.1 N m clear of the torque where a joint stops being held against one side of its gear backlash. That removed the errors the balance controller caused, but it left 0.3 to 0.8 mm from waist and arm joints, which no choice of foot forces can reach.

Milestone 38 tries the arms' version of the same cure. The robot holds the nailer in both hands. If it pushes its hands towards each other (or pulls them apart) along the line between the grip points, the two forces cancel: no net force and no net moment on the tool. The tool's load, the foot forces, the leg joints and the waist don't change. Only the joints between the waist and each hand do.

**What the numbers say** (Unitree G1 and H1 models in MuJoCo, 34 poses leaned into the wall, a Robotiq FT 300 wrist sensor with 0.2 N of error, the leg preload from milestone 37, statics only):

- **The physics checks out.** One newton of squeeze moves the base, legs and waist by at most about 1e-16 N m, which is rounding error. It moves an arm joint by up to 0.47 N m.
- **A squeeze of 10 N clears every arm error.** The controller chooses the squeeze from its own plan to keep the arm joints as far from the threshold as it can. Arm flips fall from 14 to 0, at a 10, 20 or 40 N bound.
- **The stack nearly closes.** With the hose drag anywhere in 0 to 20 N, the G1's worst pose loses 0.05 points of clean sheets instead of 1.64. The H1 loses 0.02 instead of 2.19. At a 5 N drag, the G1's worst residual along the wall falls from 0.83 to 0.49 mm.
- **The waist is what's left.** The cells that don't move are the ones where a waist joint (the H1's torso) is the one at the threshold. The worst residual left is 0.50 mm. Only the tool's own load sets those torques.
- **The margin is thinner than we registered.** At the G1's worst pose a 20 N squeeze buys 0.07 N m, not 0.1. It takes 40 N to get there.
- **The old sensor gets worse.** With the FT 300's pre-2017 noise (2.4 N of error) the squeeze makes some cases worse, up to 0.93 mm at no drag.

Of the five hypotheses we registered before the run, four held and one was refuted.

**A side finding.** Before the run we found that the G1's right wrist pitch already carries more than its 5 N m rating (the limit in the MuJoCo model) at 7 of the 14 poses, the low ones. That's just from holding a 3.4 kg nailer with its nose 0.3 m ahead of the grip. We changed the rule so the squeeze can't push any joint further past its limit, and the write-up says so. A real G1 would need a lighter tool, a shorter reach or a different grip at those heights.

**What a spec should say.** With a current wrist force-torque sensor, a robot using model-based backlash compensation should hold its leg joints clear of the threshold through its foot forces and its arm joints clear through a two-hand squeeze of 10 N or more. The waist needs a grip that changes its share of the load, or less backlash. Two caveats: neither robot's hand publishes a grip force, so the squeeze is swept, and the 0.2 N m threshold comes from our own model, not a datasheet.

Code, results and the paper draft: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
