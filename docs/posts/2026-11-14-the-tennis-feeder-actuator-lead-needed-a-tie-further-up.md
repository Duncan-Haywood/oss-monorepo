---
title: "The tennis feeder's actuator lead needed its tie further up the body"
seo_title: "Sizing a moving actuator cable: one cut length for the whole stroke"
date: 2026-11-14
tags: [open-tennis-robots, hardware, cad, cables]
description: "Five wires to the elevation actuator: a tie 70 mm up its body gives one 220 mm cut that fits every pose; ties at 15 to 30 mm fit none."
---

The open tennis-ball feeder tilts its launcher head with a linear actuator.
The actuator sits outboard of the guard-side cheek, and its body swings
through about 70 degrees about its anchor bolt between its two end stops.
Two days ago the head's own 15 wires got a routed loop. The actuator's five
wires (two 18 AWG for the motor, three 26 AWG for the feedback pot) still
stopped at the cable gland in the middle of the turntable, with "not yet
modelled" written beside them. This run modelled them.

## The route

The lead leaves the gland's bore beside the head's bundle, turns sideways
12 mm up, and runs tied straight across the turntable under the pivot bolt.
We put it there because the head swings least directly under its pivot. It
goes through a new 10 mm grommet hole in the guard-side cheek, between the
cheek's two feet. That hole is the only change to a laser-cut part. From
there it makes one free span to a zip tie on the actuator's body. Wherever the
real actuator's cable leaves its housing, you tape it along the body to that
tie. So the tie, not the cable exit, is the end that moves, and its position
is something we can choose.

## One cut, every pose

The wire gets cut once. So one length has to fit at every elevation the
actuator can reach, both of its end stops included, not only the -15 to +45
degrees the drills use. For each of seven poses the model searches a family
of smooth curves from the cheek hole to the tie. Every curve keeps 3 mm plus
the bundle's radius off the turntable plate, the cheek, its feet, the
actuator's body and its anchor eye. None bends tighter than 20 mm (ten times
the 18 AWG wire's diameter, since this lead flexes on every elevation move),
and none hangs more than 10 mm outboard of the actuator. Each pose then has a
shortest and a longest length that fit, and the cut has to sit inside all
seven ranges.

Where the tie goes turned out to matter more than anything else:

| Tie, from the anchor eye | Lengths that fit every pose |
|---|---|
| 15 mm | none |
| 30 mm | none |
| 50 mm | 189 to 191 mm |
| 70 mm | 209 to 231 mm |
| 90 mm | 230 to 244 mm |

A tie close to the anchor hardly moves. That sounds like the easy case, but
the body's direction still swings 70 degrees, and the lead has to leave the
body along it. A short span can't turn through that within a 20 mm bend. At
70 mm the tie moves 82 mm, but the span is long enough to follow it. Nose up
(the retract limit) sets the shortest length that fits, 209.5 mm, and nose
down (the extend limit) sets the longest we found, 230.8 mm. So the cut is
220 mm, with 11 mm to spare either way. That top end is a floor rather than
a ceiling: with longer curve handles the search finds 240 mm nose down, while
the bottom end doesn't move. We also tried keeping the lead inside the
actuator's outer face, and then nothing fits nose up.

The span is then drawn at 220 mm for each pose and run through the build's
collision check against every part. The head is straight ahead and also
turned to the hard stops either way. Nothing clashes. The elevation and
azimuth sweeps include it too, posed with the head.

## The wires themselves

The motor pair runs 1.39 m from the H-bridge on the deck: along the deck, up
the twisting run on the turntable axis, across the turntable and through the
span. At the actuator's assumed 3 A stall, 18 AWG drops 0.17 V, 0.7% of the
24 V supply. The build fails if a stall current goes over what the gauge
carries, if the drop goes over 3%, or if the grommet hole is too small, too
low or on one of the cheek's feet. Tests check that each of those rules fires.

## What is still assumed

Where your actuator's cable leaves its housing, and how stiff its jacket is.
A jacketed cable stiffer than loose silicone wire needs a bigger bend than
20 mm, and the window would shrink. The pot shares the lead with the motor's
PWM, so twist the motor pair. Before anything is powered, bend a built lead
through the whole travel by hand. The model, the numbers and the checks are
in `ventures/open-tennis-robots/cad/README.md`, under "The elevation
actuator's lead".

Open Tennis Robots is an open-source (MIT) design for a ball feeder and
collector. No robot has been built yet. Read the safety notes before you build
one. This post is engineering notes on a design, not electrical, safety or
professional advice.
