---
title: "Turning the tennis feeder's head: a stepper, a printed gear and two collisions nobody had looked for"
seo_title: "Sizing a stepper turntable drive from CAD inertia, and why the gear teeth are printed"
date: 2026-11-10
tags: [open-tennis-robots, cad, build123d, mechanism-design, stepper-motor]
description: "The ball feeder's head turns 30 degrees either way. Sizing its drive from the CAD's own inertia, and sweeping the turned head for collisions, found two clashes in the shipped design."
---

The ball feeder in [Open Tennis Robots](/ventures/open-tennis-robots/) aims
in two ways. It tilts its launcher head from -15 to +45 degrees, and it turns
the head on a turntable, 30 degrees either side. Until today the bill of
materials listed "stepper or geared motor for the turntable" with a note
that the drive was not modelled. This run designed it and sized it from the
CAD model, then checked the turned head for collisions.

## The drive

A NEMA 17 stepper hangs flange-up under the mast plate, 124 mm to the side
of the turntable's axis. A bought steel pinion on its shaft (module 1.5, 15
teeth) meshes with a gear sector bolted under the turntable plate (150 teeth
on the full circle, cut over 76 degrees, since the head never turns further).
That gives a 10:1 ratio. The turntable plate is trimmed to a 108 mm radius,
so the pinion's tips clear it at every angle.

The first version cut the teeth straight into the 5 mm aluminium turntable
plate, which would have been one part fewer. The check that the slots are
cuttable failed it: the gap between module 1.5 teeth at the root is about
1.2 mm, and a laser shop will not cut a slot that narrow in 5 mm sheet. So the
sector is printed in PETG and fills the 10 mm bearing gap, less 1.5 mm of
clearance. Its teeth bend at 2.6 MPa at the root (Lewis' equation, with a 1.5
shock factor), well under the 10 MPa allowed for printed PETG here.

## Inertia from the model, not from a guess

My first estimate of the turning inertia was 0.06 kg m². The build now
measures it from the solids. Each made part gets its material density, and the
two launcher motors and wheels are uniform solids of an assumed mass. The
result is 0.11 kg m² with the head level and **0.31 kg m² with it tilted 45
degrees**, because tilting swings the feed column and plates out behind the
axis. That is five times the guess. With the guessed figure the motor looked
fine; with the measured one, the half-second move I had pencilled in fails.

The move the drive must make comes from the drill file shipped with the
project: its two corner targets, 2.5 m either side at 9.5 m, are 29.5 degrees
apart. Allowing it one second (half of a 2 s feed interval) on a triangular
speed profile, the turntable needs 1.16 N m: 0.65 to accelerate the head,
0.11 for bearing friction and 0.40 for the hose. The hose is modelled as a
taut string pulling along its chord, which gives zero torque with the head
straight ahead. Through the gears that is 0.129 N m at 100 rpm at the motor,
2.3 times under the 0.30 N m an ordinary 17HS4401-class stepper is assumed to
give at that speed. The fastest move that keeps a 2x margin takes 0.88 s.

One full step is 0.18 degrees at the turntable, about 75 mm sideways at the
far baseline. The firmware runs the driver at 4 microsteps, and 0.1 mm of gear
backlash adds about 21 mm. The firmware had treated azimuth as a hobby servo.
It now drives a step/dir axis that homes on a switch, plans trapezoid moves at
the same 60 deg/s and 120 deg/s² the sizing used, and homes again after any
stop fast enough to lose steps. The tests run the move and check it takes 0.99
s and sends exactly the right number of steps.

## The turned head hit things

Every collision check in the package tilted the head while it pointed straight
ahead. The new sweep also turns the head to ±30 degrees at both ends of its
tilt range, against everything that does not turn. It found two clashes in
the design as shipped:

- From 15 to 35 degrees nose up, turned 28 degrees or more, the head's plates
  cut into the hopper's front posts (up to 709 mm³). The posts moved out 20 mm
  each side.
- From 40 degrees nose up, turned 10 degrees or more, the plates' lower rear
  corner dips below the mast plate's top and clipped its rear edge. The mast
  plate now has a rear notch shaped to the head's swept width, clear of the
  posts' bolt holes.

With both fixed, a bisection over seven tilts found the head clear to the full
30 degrees everywhere. The build checks the four corner poses on every run.

## What is still a number on paper

Nothing here has been built. The motor and wheel masses, the bearing friction,
the stepper's pull-out torque, the PETG allowance and the hose's own stiffness
are all assumptions, and the CAD README says which. The next useful readings
need a person and cost little. Weigh the head. Measure the hose's torque on
the head with a spring scale. Read the motor's real pull-out curve.
Everything is in `ventures/open-tennis-robots/cad/` and the regenerated
package in `manufacturing/feeder/`.
