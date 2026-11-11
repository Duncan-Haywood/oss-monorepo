---
title: "The tennis-ball feeder's head wants to look up, and that makes the elevation drive easier"
seo_title: "Tennis robot feeder CAD: sizing the elevation actuator"
date: 2026-11-11
tags: [open-tennis-robots, cad, hardware]
description: "Measured from the CAD, the tennis feeder head's weight pulls its nose up at every angle, so one actuator pushes one way, 18 to 100 N."
---

The open tennis-ball feeder tilts its launcher head from 15 degrees nose-down
(flat drives) to 45 degrees nose-up (lobs). Until today the CAD had a pivot
bolt, a hole marked "elevation link" and nothing to drive it. The firmware
still treated elevation as a hobby servo.

The first job was to measure the load rather than guess it. The build already
knows every solid in the head, so `feeder.head_moment` integrates them, with
the plates and printed parts at their material densities and the motors and
wheels at assumed masses. The head weighs 6.67 kg, and its centre of mass sits
61.5 mm behind the pivot and 192 mm above it. That makes it top-heavy and
tail-heavy, so its weight pulls the nose **up** at every angle in the range:
0.63 N m at -15 degrees, 4.0 at level and 11.75 at +45. It balances near -18
degrees, just outside the range.

That is good news for the drive. It never has to hold the nose up, only stop it
rising, so an actuator can push one way all the time and never cross its
backlash in the middle of a move.

The old link hole could not be used. It sits 140 mm above the turntable and
moves 97 mm up and down. No linear actuator is shorter than its stroke plus its
two end eyes: the Actuonix L16, for example, is 168 mm long retracted for a 100
mm stroke. So a grid search tried pin positions anywhere on the guard plate
(behind the ball column, above its roof) and anchor positions anywhere on a
small tab behind the guard-side cheek. Each candidate was checked against stock
100, 150 and 200 mm strokes. The search kept the layout with the least peak
push. It puts the pin high at the back of the plate, 316 mm from the pivot,
and the actuator in a plane 72 mm outboard of the cheek on the side away from
the launcher motors, where nothing on the head reaches.

The result:

- Pin to anchor is 371 mm at -15 degrees and 248 mm at +45, changing
  monotonically. Any actuator that is 245 mm or less retracted and 374 mm or
  more extended, hole to hole, fits, with 3 mm kept off each end stop.
- The push needed is 18 N at -15 degrees and 100 N at +45. That figure is the
  worse of the hose slack or pulling at the assumed 5 N, and the lever arm
  never drops below 100 mm. A 50 lb (220 N) class actuator leaves 2.2x.
- At an assumed 20 mm/s, the head turns 9 to 11 degrees per second, about a
  third of the azimuth drive's speed. Shot plans should keep elevation changes
  small.

The actuator is posed at every elevation in the collision sweeps. The build
still reports no clashes tilted -15 to +45 degrees or turned 30 degrees either
way. One knock-on was caught by the build itself: the actuator's assumed 0.6 kg
raised the turning inertia measured for the azimuth drive to 0.340 kg m², above
the 0.32 it had assumed. That assumption is now 0.35 and the stepper's margin
is 2.2x.

Nothing here is built. The masses, the 220 N rating and the 20 mm/s speed are
assumptions, and the actuator datasheet figures came through a search because
the maker's site was blocked from the build machine. A builder should weigh the
head and check their own actuator's retracted and extended lengths against the
window. They should also find out whether it holds position with the power
off: if it does not, the head falls back to its nose-up stop. Next is the
firmware: elevation is still driven as a servo, and an actuator needs a
feedback potentiometer, or timing from a known stop.

Code and checks: `ventures/open-tennis-robots/cad/` (`Feeder.elevation_drive`,
`check_elevation`, `feeder.head_moment`); the regenerated package is in
`ventures/open-tennis-robots/manufacturing/feeder/`.
