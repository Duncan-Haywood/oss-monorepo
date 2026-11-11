---
title: "We built a simulated drape test, and it measured our mesh instead of the fabric"
seo_title: "Simulated Cusick drape test: spring-grid cloth locking"
date: 2026-11-11
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin]
description: "A simulated Cusick drape test ranks four fabrics correctly, but stretch stiffness and mesh move its drape coefficient more than bending rigidity does."
---

The [`hanger-codesign`](../../research/hanger-codesign/) programme asks how good
a cloth simulator has to be before the laundry-robot hanger it designs is the
right one. Its plan was to calibrate the cheap 3D cloth sheet against the
standard textile drape test. In the Cusick test, a 30 cm circle of fabric is
clamped on an 18 cm disc and allowed to hang. The drape coefficient (DC) is the
share of the overhang that the hanging fabric's shadow still covers: 1 for
card, near 0 for silk.

We wanted to compare the simulated DC with a published table of measured DC,
bending rigidity and weight for the same fabrics. This session could not reach
any of the papers that have one, so we asked a question that has to be answered
before such a table is any use. On this model, does DC follow bending rigidity?

We simulated the test 140 times on the four fabrics whose bending rigidity and
weight are published KES-FB measurements. Each case ran until the DC moved
less than 0.001 per 2000 solver iterations. Seven predictions were written down
before the run.

- **It ranks the fabrics correctly.** DC came out at 0.19, 0.21, 0.32 and 0.45,
  in order of bending length. Seed noise was under 0.01, with 8 to 14 folds per
  specimen.
- **The unmeasured inputs move it more.** Changing the stretch stiffness from
  40 to 800 N/m moved DC by 0.15 to 0.23. On the softest fabric that is more
  than a 16-fold change in bending rigidity does. Shear stiffness moved it by
  0.08 to 0.11, and a coarser grid by up to 0.05.
- **Stiffer springs do not converge to anything.** As the stretch stiffness
  rises towards an inextensible fabric, every fabric's DC climbs to about 0.77.
  At that point a cotton jersey and a suiting with 19 times its bending rigidity
  drape alike.

That last result is membrane locking, the known failure of cloth on a regular
spring grid. A fabric's folds are nearly isometric. A coarse grid cannot form
them without stretching its springs, so the stiffer the springs, the more the
sheet behaves like a plate.

For the programme, this changes the plan. On this tier a measured drape
coefficient cannot pin bending rigidity, so the cheap models keep taking
bending rigidity from KES-FB directly. Drape calibration moves to the validated
solver of the next milestone, and this test becomes that solver's acceptance
check: its DC has to stay flat as stretch stiffness and mesh change. It also
casts doubt on [yesterday's](2026-11-11-hanger-solver-stopping-rule.md) 0.5 cm
disagreement between the 2D and 3D models on a shallow arm. That disagreement
came from the same locking grid, so it needs rechecking across stretch
stiffness and mesh before it is read as physics.

The code, results and predictions are in
[`research/hanger-codesign/experiments/m2_cusick/`](../../research/hanger-codesign/experiments/m2_cusick/).
This is simulation only: no measured drape has been compared yet.
