---
title: "A wrist force sensor fixes most of a nail gun hose's pull on a robot, but not the last half millimetre"
date: 2026-11-16
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, force-torque-sensor, digital-twin]
seo_title: "Does a wrist force-torque sensor fix a nailing robot's hose error?"
description: "With a wrist F/T sensor, 0-20 N of hose drag costs a humanoid 1.6 points of clean sheets, not 92. Joints at the friction threshold still leave 0.3-0.8 mm."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. Earlier today, milestone 35 found that the nail gun's air hose is the problem. Dragged along the floor, it pulls on the tool with a force nobody models. A 5 N pull leaves the robot's backlash compensator 1 mm off along the wall. With the drag anywhere between 0 and 20 N, the worst pose loses 92 points of clean sheets.

Milestone 36 tries the fix a controls engineer would reach for first: put a force-torque sensor at the wrist. The compensator then predicts each joint's load from the measured wrench, not from a model that leaves the hose out.

**The sensors.** Robotiq's FT 300 manual lists 0.1 N of signal noise on each force axis. Its version sold before October 2017 listed 1.2 N. ATI's Mini45 (SI-145-5 calibration) lists a resolution of 1/16 N, and ATI publishes no accuracy figure for it. Neither maker publishes bias drift, so we swept the error from 0.001 N to 2.4 N.

**What the numbers say** (Unitree G1 and H1 models in MuJoCo, 35 poses leaned into the wall, statics only):

- With a 0.2 N error (twice the FT 300's noise), the G1's worst residual at a 20 N drag falls from **2.34 mm to 0.29 mm**. With the drag anywhere in 0 to 20 N, the worst pose loses **1.6 points** instead of 91.6.
- Getting the joints' stiffness wrong by 25% hardly matters: 0.06 to 0.10 mm at a 5 N drag. One calibration takes most of that error out.
- **The floor.** The residual stays above about 0.3 to 0.5 mm, however good the sensor is. At a 5 N drag, a 0.001 N error leaves nothing, 0.01 N leaves 0.27 mm and 0.2 N leaves 0.82 mm. The cause is a handful of joints whose torque sits within 0.0014 to 0.05 N m of the threshold where a joint stops being held against one side of its gear backlash. Any error in the measured load can predict such a joint on the wrong side, which costs half a backlash gap.
- The older sensor (1.2 N noise) does worse than having no sensor at all: 33 to 87 points lost.

**What a spec should say.** Measure the wrench at the wrist. It takes care of the windup and the balance, even with the joints' stiffness only roughly known. Model-based backlash compensation, though, is only as good as its decision about which side each joint is held on. Joints near the threshold need a preload that pushes them clear of it, or else less backlash in the first place. One caveat: that sharp threshold comes from our own model (0.2 N m, not sourced), and a real joint probably changes over more gradually. So the 0.3 to 0.8 mm floor is an upper bound on how brittle the compensation is, not a measured figure. Two of our four registered hypotheses were refuted: the one that said the sensor would get the residual under 0.1 mm, and the one that said the joints' stiffness would need to be known.

Code, results and the paper draft: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
