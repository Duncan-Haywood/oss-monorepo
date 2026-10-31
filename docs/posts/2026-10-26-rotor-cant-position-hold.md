---
title: "Tilted rotors help a quadrotor yaw, but the sideways force they make can wreck position hold"
seo_title: "Tilted rotors help quadrotor yaw but can wreck position hold"
date: 2026-10-26
description: "Simulated co-design: canted rotors cut yaw error by about 6 degrees, but designs tuned without the lateral force they create drift 1 m instead of 0.25 m."
tags: [research, quadrotor, co-design, simulation]
---

Five earlier projects in [`research/`](../../research/) found that tilting a quadrotor's rotors about their arms buys yaw authority, and each ended by saying "add position hold". [`codesign-aero-cant-poshold`](../../research/codesign-aero-cant-poshold/) does that.

A tilted rotor pushes sideways by tan α / r newtons for every newton-metre of roll or pitch torque commanded (a closed form, checked in the tests against an explicit four-rotor allocation). With that force and an outer position loop in the simulation, a joint search over arm length, propeller size, cant and nine gains (5 seeds, 64 held-out episodes) gave:

- Yaw error falls about 6 degrees against no cant, in 5 of 5 paired seeds. Position error does not improve (0.25 m and 0.22 m against 0.22 m).
- Designs tuned with the sideways force left out, then run with it, reach 1.1 to 1.2 m position error, against about 0.25 m when the force is in the loop. Worse in 5 of 5 seeds.
- Switching the force off improves force-aware designs, so for this layout it acts as a disturbance and not as extra authority.

Limits: 2-second episodes, simulated only, several seeds stop in local optima, and the cost, noise and plant numbers are inherited or assumed (the README lists them). Read the [full write-up](../../research/codesign-aero-cant-poshold/README.md).
