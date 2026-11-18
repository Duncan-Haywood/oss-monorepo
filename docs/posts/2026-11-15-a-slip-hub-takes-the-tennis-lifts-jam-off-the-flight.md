---
title: "A slip hub takes the tennis lift's jam off the flight"
seo_title: "Sizing a friction slip clutch for a belt elevator's current cutoff"
date: 2026-11-15
tags: [open-tennis-robots, hardware, mechanical, firmware, simulation]
description: "A friction slip hub on the feeder's lift pulley cuts a jam's peak on a flight from up to 214 N to 51-88 N in simulation, and forced a lower current trip."
---

The open tennis-ball feeder lifts returned balls 2.36 m to its hopper on a
cleated belt. [This morning's post](2026-11-15-a-current-cutoff-saves-the-tennis-lift-motor-not-the-flight.md)
added a current cutoff that stops a jammed lift within about 30 to 90 ms. It
also found something the cutoff cannot fix. The gearmotor's rotor, seen through
its 30:1 gearbox, acts like 18 kg at the belt. When a ball jams, that inertia
drives into the ball's own stiffness in about a quarter of a 55 ms swing, which
is before any cut can act. It put up to 172 N on one printed flight cap, and
214 N with twice the assumed rotor inertia. The cap's plate is rated for 156 N.

This run adds a fix: a friction slip hub between the gearmotor's shaft and the
drive pulley.

## The hub

The pulley gets a plain 6 mm bore and turns freely on the shaft. It is driven
only through a friction facing on each face. Outside each facing is a
laser-cut 2 mm steel plate with a D-shaped bore, so the plates turn with the
shaft but can slide along it. A shaft collar holds the motor-side plate in
place. On the far side, a disc spring sits between the second plate and a
second collar, and the collar's position sets how hard the stack is squeezed.

You set the slip point on the bench: put the shaft stub in a vice, wrap a strip
of the belt round the pulley, and pull it with a luggage scale. Slide the
collar in until the strip slips at 71 N, which is 0.9 N m, then lock it. The
friction coefficient in the model (0.3) only sizes the spring. The measured
setting is what decides the slip torque.

## Why the trip current had to move

A slip hub has a failure mode that a rigid pulley does not. If the hub slips
but the motor keeps running, the cutoff sees a motor turning against the
hub's sliding friction. That draws less current than a stall, and a jam could
grind for the whole 16 s run-on with no cut and no flag to the operator.

At its lowest setting (0.72 N m, sliding at 0.8 of that) the motor draws 2.30
A while the hub slides. The cutoff as first built tripped somewhere between
2.18 and 2.78 A, so it might never have seen that slide. The fix is one
resistor. The comparator's divider goes from 3.9k to 2.7k, so the trip is
1.74 A, between 1.47 and 2.00 A across part tolerances. That is still 2.5
times the torque a fully loaded belt needs. But a start now stays above the
trip longer: 86 ms at the assumed rotor and 170 ms at twice it. So the
firmware's start blanking went from 300 to 400 ms.

## What the simulation shows

`tests/lift_jam_sweep.py` runs the real ESP32 firmware against a plant model
at 0.1 ms steps. The model now has two inertias, motor side and belt side,
joined by a stick-slip friction joint. Results across the pack's voltage
range, rotor inertia from 0.5 to 2 times the assumed figure, and a jam at the
boot or at the hood:

| case | peak on a flight | cut after contact |
| --- | --- | --- |
| rigid pulley, lowest trip | 85-214 N | 29-49 ms |
| hub at its highest torque, lowest trip | 77-88 N | 29-49 ms |
| hub at its lowest torque, highest trip | 51-65 N | 49-179 ms |

Every case stays under the plate's 156 N. Starts with a full belt never slip
the hub and never trip the cutoff. A slow cut happens when the hub slides
easily and the trip sits high: the motor side has to slow down before its
current climbs past the trip. Even then the lift gives up and raises
`FLAG_LIFT_JAM` within 2.6 s. Each jam puts 0.4 to 4.5 J of slip into the
facings.

## What it does not settle

The stack needs about 63 mm of 6 mm D shaft past the gearmotor's face. That
is 10 mm more than the rigid pulley already needed to reach its far face.
Many small gearmotors may have shorter shafts, so a builder may need a coupler
and an extension, and this check is the next CAD item. Everything else here is
assumed until built: the facing's friction and how it changes with damp and
wear, the disc spring's load, and every motor figure. The test is simple: set
a built hub with the scale, hold a flight, run the motor, and watch it slip
and trip.

Code and numbers: [`ventures/open-tennis-robots/cad/README.md`](../../ventures/open-tennis-robots/cad/README.md),
"Lift slip coupling". Nothing here has been built or tested on hardware.
