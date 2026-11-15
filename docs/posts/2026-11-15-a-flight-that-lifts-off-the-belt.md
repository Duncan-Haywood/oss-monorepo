---
title: "A ball-lift flight with a pad that lifts off the belt round each pulley"
seo_title: "Cleated belt elevator flights: a printed cap on a welded PU cleat"
date: 2026-11-15
tags: [ventures, open-tennis-robots, cad]
description: "Why a welded cleat alone nearly doubles a ball lift's belt pull, and the printed cap with a loose pad that fixes it without stopping the belt wrapping."
---

The open tennis-ball feeder lifts balls 2.36 m from a sump at court level to
its hopper on a cleated timing belt. Two days ago its flights changed from
printed fingers screwed through the belt to polyurethane cleats the belt
supplier welds on. A screw through an AT5 belt doesn't fit: its head would
sit on the tooth side. That work never landed. Today it did, along with the
part it left out.

**The model had kept a plate that no longer existed.** The lift's load
model took each flight's moment "as a couple over the flight's 30 mm base
plate". A ball weighs 0.57 N and sits up to 16 mm out on the flight, so it
tips the flight back. The belt pushes into the UHMW strip on the spine where
it slides, and that friction is part of what the motor pulls. With the
plate gone, only the cleat's own welded foot takes the moment: about 5 mm
of it (assumed), so about a 2.5 mm arm. That presses the belt into the strip
with 3.58 N per ball instead of 0.60 N. Per ball the pull goes from 0.70 N
to 1.30 N, and with every flight loaded from 10.5 N to 19.4 N. The motor
would still cope (2.4x margin instead of 4.5x), but the belt tension, the
wear on the strip and the tensioner landed today would all have been sized
for half the real load.

A 30 mm rigid plate bonded to the belt wouldn't have worked either. The
pulleys are 16-tooth, and the belt's back runs round them at a 14.25 mm
radius. A rigid plate twice that long can't wrap.

**The cap.** Each cleat now carries a printed PETG cap:

- a 30 × 16 × 5 mm plate on the cleat's leading face, which is the flight a
  ball sits on;
- two cheeks that wrap the cleat's ends;
- two countersunk M3 screws through the plate and the cleat, with their
  heads flush under the ball;
- a 2 mm pad, 19.5 mm long, behind the cleat.

The pad lies loose on the belt and isn't bonded to it. On the straight, the
ball's moment presses the pad into the belt while the cleat's foot pulls the
other way. If the pad's pressure rises from its near end, the push acts
15.0 mm from the cleat. That's the old model's 15 mm, so the lift's pull
and the tensioner's 10.5 N stand. Round a pulley the belt simply wraps away
under the pad, which stays a straight tangent. The design limit is that
tangent's far corner: it swings out to √(14.25² + L²) from the pulley's
axis, and that has to stay inside the 30.25 mm circle the finger tips sweep,
which the boot and the hood were drawn round. That sets the pad's length.
A test turns the drawn cap round both pulleys in 15° steps and finds it
clear of every lift part.

**Jams.** If a ball wedges at a pulley, the motor stalls on one plate. At an
assumed 2.5 times its rated torque that is 118 N. The plate then takes
15 MPa (20 allowed for PETG printed flat, assumed), and the weld takes 125 N
of peel (300 assumed). The cap prints flat on its plate's face with no
support, 3.8 cm³ each, 32 of them.

**Still assumed.** None of this is built. The cleat's foot, the weld's
strength, the pad's pressure shape on a real strip and the motor's stall
ratio are all assumptions. The cheapest test: one capped cleat on a short
length of belt over a strip, one ball on it, and a spring scale to measure
the drag. Details are in the feeder's
[CAD notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/cad/README.md).
