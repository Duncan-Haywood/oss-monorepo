---
title: "The tennis lift's pulley gets its own shaft, and the motor has to get shorter"
seo_title: "A belt pulley on its own shaft: flexible vs rigid coupling, in numbers"
date: 2026-11-15
tags: [open-tennis-robots, hardware, mechanical, cad]
description: "The tennis feeder's lift pulley moves onto its own shaft in two bearings so the gearbox carries torque only; the collision check then caps the motor at 75 mm."
---

The open tennis-ball feeder lifts balls to its hopper on a cleated belt. The
belt's bottom pulley is driven by a 37 mm gearmotor. [Earlier today](2026-11-15-a-slip-hub-takes-the-tennis-lifts-jam-off-the-flight.md)
the pulley got a friction slip hub, so a jammed ball no longer takes the
gearmotor's whole rotor inertia. That post ended on a loose end. The hub's
stack of facings, plates, a disc spring and two collars needs 63 mm of 6 mm D
shaft past the gearmotor's face, and a stock shaft is about 15 mm long.

**What the old layout hid.** Before the hub, the pulley sat on the gearmotor's
own shaft, 38 mm out from its face. So the gearbox's output bearing carried
the whole belt load as an overhung moment. Both of the belt's strands pull up
on the drive pulley. While both stay taut they sum to twice the static
tension, 21 N, whatever the torque. Past that, the slack strand goes slack and
the load is torque over radius. The most torque the pulley can ever pass is
the slip hub's highest setting, 1.08 N m, so the worst case is 85 N at a jam.
At 38 mm that is 3.2 N m on the gearbox, and 0.8 N m just running. We assumed
an allowance of 0.5 N m. That figure is a placeholder: few small gearmotor
datasheets state one.

**The fix.** The pulley now rides a separate 84 mm stainless D shaft in two
flanged F626 bearings, one pressed into each wall of the printed boot, 67 mm
apart. A jaw coupling inside a 31 mm printed spacer joins that shaft to the
gearmotor's. The bearings take the belt load and the coupling passes only
torque, so the gearbox carries no side load. Running, the shaft sees 20 MPa
and sags 12 µm. At a jam it sees 94 MPa. A jam lasts only a few revolutions
before the current cutoff stops the motor, so that figure is checked against
a static allowance, not a fatigue one.

**Why not a rigid coupling.** A rigid coupling is shorter and was the obvious
choice. But a rigid coupling plus a far bearing makes the shaft
overconstrained. The 6 mm shaft is about 56 N/mm stiff over that span. A
0.3 mm print error in the far bearing's position would push 17 N, or 1.4 N m,
into the gearbox, which is more than the belt load it was meant to remove.

**What the collision check found.** The model had reused the base drive's
gearmotor: 100 mm long, encoder included. Set out by the spacer, its back end
went 16 mm into a drive-wheel bracket and the wheel. The lift doesn't need an
encoder, since it senses jams by current, not position. So the lift's
gearmotor is now its own part: at most 75 mm from face to back, which leaves
9 mm to the bracket. That length is assumed for a 37 mm gearmotor with no
encoder. Measure yours before you buy; the check fails above 75 mm. The lift
motor's cable now runs through the gap between the motor and the bracket.

**What isn't known.** We haven't measured a real gearmotor's shaft length,
body length or side-load rating. The side-load rating decides whether the old
layout really was overloaded. Also unmeasured: the coupling's torque rating
and stiffness, and how well a bearing press-fits in printed PETG. Print a
test ring first.

Code and numbers: [`ventures/open-tennis-robots/cad/README.md`](../../ventures/open-tennis-robots/cad/README.md),
"Lift drive shaft". Nothing here has been built.
