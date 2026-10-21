---
title: "Can you 3D print a robot? Where the money goes in a printed robot arm"
date: 2026-10-21
description: "We measured an open 3D-printed robot arm: plastic is about 6% of the parts cost, servos about 70%. What an automated robot factory would need."
tags: [research, robotics, 3d-printing, manufacturing, automation]
---

# Can you 3D print a robot?

Imagine a machine that does for robots what a 3D printer does for plastic
parts: you send it a design, and a working robot comes out. If it existed,
people could get useful machines for little more than the cost of materials.
This post asks what such a machine would have to be, starting from one
measured fact about today's cheapest open robot arm.

Nothing here was built or tested on hardware. It is a direction for research,
not engineering or business advice.

## The plastic is the cheap part

The [SO-101](https://github.com/TheRobotStudio/SO-ARM100) is an open-source
robot arm from TheRobotStudio and Hugging Face, popular for robot-learning
experiments. Its frame is 3D printed and everything else is bought. Its
repository lists the bought parts for one arm at $121.94 (US prices) and
publishes the printed parts as STL files.

We downloaded the follower arm's STL and measured it with a short script
([`so101_cost.py`](../reports/assets/printed-mechatronics/so101_cost.py)).
The printed parts enclose 571 cm³. Solid PLA would weigh 708 g. At the
repository's recommended 15% infill, the estimate is 277 to 447 g, depending
on wall thickness. That is a geometric estimate; we did not run a slicer.

| Line | Cost | Share |
|---|---|---|
| Six STS3215 servos | $83.34 | 70.5% |
| Controller board, USB cable, power supply | $27.60 | 23.4% |
| Printed plastic (about 360 g at $20/kg) | about $7.24 | 6.1% |

Tools such as clamps and a screwdriver are left out. Even if every part were
printed solid in $30/kg filament, the plastic would come to $21. The servos
would still cost four times as much.

So a machine that "prints robots" faces little difficulty with the printing.
The structure of a hobby robot is already cheap. What costs money is the
motion: motors, gears, position sensors and the electronics that drive them.

## Can we print the motors too?

Researchers are working on it, and the results are impressive but early.

- In 2023, a team from ETH Zurich, MIT and the company Inkbit printed a
  robotic hand with bones, ligaments and tendons in a single job, using an
  inkjet printer that scans each layer with cameras
  ([Buchner et al., *Nature*, 2023](https://doi.org/10.1038/s41586-023-06684-3)).
  The hand is a mechanism; it still needs something outside to pull the
  tendons.
- In 2026, MIT researchers reported a fully 3D-printed electric motor: a
  linear actuator made from five materials in about three hours, with about
  50 cents of material
  ([MIT News](https://news.mit.edu/2026/3d-printing-platform-rapidly-produces-complex-electric-machines-0218)).
  It moves 318 micrometres at its resonant frequency, and its magnets must be
  magnetised after printing. That is a real first, but it is a long way from
  the 16.5 kg·cm of stall torque a $14 hobby servo provides.

Fully printed robots will come. For now, a system that makes working robots
cheaply has to buy its actuators.

## What the factory would actually look like

If printing is cheap and actuators must be bought, the "robot printer"
becomes a small automated cell with five parts:

1. **A farm of ordinary 3D printers** for the structure. This part is solved.
2. **A short catalogue of mass-produced modules** that every design uses:
   smart servos that chain on a single cable, one controller board, one power
   supply and standard screws. Buying a few part types in volume is where the
   low price comes from.
3. **A robot arm that assembles** the robot: it seats servos in printed
   pockets, drives screws and plugs in cables. Daisy-chained servos matter
   here because routing loose wires is one of the hardest jobs to automate.
   Designs would be rewritten so that everything goes in from above, with
   snap fits instead of screws where possible.
4. **A self-test** in which the finished robot calibrates and checks itself
   with its own motors before it is packed.
5. **Later, more printed parts**: printed gearboxes around bought motors,
   then printed motors, each adopted when it beats the catalogue part on cost
   and strength.

For circuit boards, open-source desktop pick-and-place machines such as
[LumenPnP](https://docs.opulo.io/) can already place small surface-mount
parts. The hard step in between is the one people do by hand today: fitting
modules together and wiring them.

## What we already know from simulation

This repository's research portfolio has studied pieces of that cell
in simulation. The [robot assembly roundup](2026-10-20-robot-assembly-simulation-digital-twin-findings.md)
covers them. Two results bear directly on the design:

- In a robot-plus-printers cell, the arm that loads and unloads the printers
  limited throughput more than the printers' utilisation suggested.
- An arm that can only work from above could still assemble a toy gripper,
  in 120 of 720 possible part orders, provided the design allowed it.

The [self-replication roundup](2026-10-20-self-replicating-3d-printer-reprap-closure-research.md)
found the same pattern in a RepRap 3D printer: motors and electronics
dominate what a shop cannot make for itself.

## What comes next

The next studies use the real arm instead of toy shapes: count the SO-101's
real assembly steps and which of them a robot could do, simulate a cell that
builds SO-101s to estimate arms per day and labour per arm, and price a
printed gearbox against the $13.89 servo. The plan is in the
[agent brief](../reports/2026-10-21-printed-mechatronics-direction.md).
