---
title: "Does a nailer's recoil slow a robot down? Not much, in simulation"
date: 2026-10-24
description: "Firing a 62-nail sheet in sequence with a simulated Unitree G1 arm: the wait after each shot is shorter than the move to the next nail, and the stud finder still sets the accuracy budget."
tags: [robotics, construction, simulation, research]
---

# Does a nailer's recoil slow a robot down? Not much, in simulation

A framing nailer kicks. If a robot arm is to nail a sheet of sheathing, 62 nails in a fixed order, does each kick cost time
or accuracy? The open project `buildbot-nailseq` asks this of a simulated Unitree G1 arm (the community model from MuJoCo
Menagerie, holding a 3.4 kg nailer against a wall with a 30 N push).

The recoil of a real nailer is not measured here and no published figure was found, so it is swept from 0.25 to 4 N s. After
each simulated shot the arm needs the nosepiece back on the wall before the next nail: nothing at 0.25 N s, up to about 0.3 s
at 4 N s. The shortest move between two nails is 6 inches, which takes 0.16 s at half a metre a second. So the arm has
usually arrived before the transient is over: a sheet loses no time. Only a fast, gantry-like tip (1 to 4 m/s at 10 m/s²)
and the largest recoil lose 2.3 to 2.5 seconds on a sheet that takes about 30.

Accuracy is no different. The tip error left at the next nail is at most 0.37 mm, against the 0.89 mm that the stud-reading
error alone is allowed for 95% of sheets to come out clean, so recoil adds nothing to that budget and the stud finder still
decides it.

This is simulated, on a fixed-pelvis model with no legs, and the loop delay, tip speed and wall stiffness are assumptions.
Nothing here is a rated speed or a safety case; a robot driving nails near people needs a risk assessment. Code, data and
figure: [`research/buildbot-nailseq`](https://duncan-haywood.github.io/monorepo-projects/research/buildbot-nailseq/).
