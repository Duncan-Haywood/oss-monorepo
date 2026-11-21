---
title: "Tennis robots: putting a spanner on every nut in the CAD found a screw too short for its nut"
seo_title: "Tennis robots: a spanner check for every nut in open CAD"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware]
description: "The open tennis robots' CAD now lays a spanner and a hand on every nut. One nut fits only between two drum rods, and one screw was too short for its nut."
---

The open tennis robots' CAD writes its own assembly guide, and the guide is
checked against the model. Each screw's length is measured against the parts
under it. A cylinder behind each head checks that a hex key can reach it,
both on the finished robot and at the step the screw goes in. The other end
of a through-bolt was not checked. A nut is not reached along the bolt's
axis. A spanner lies flat on it, its shank sticks out to the side, and a
hand holds the end.

So now the build lays a ring spanner and a hand on every nut and turns them
round the bolt 5 degrees at a time. It checks them against everything already
on the robot when the nut's step comes. The spanner has a typical length for
its size, 85 mm for 5.5 mm up to 165 mm for 13 mm. The hand is a box: fingers
over the last 35 mm of the shank, then 150 mm of hand and wrist going outward.
A nut passes if the spanner and hand fit at some angle, because then it can be
held while a hex key turns the head. A hex head turned with a spanner also
needs 30 degrees of swing, the step of a 12-point ring.

**The drum axle's nut fits only straight between two rods.** The collector
picks balls up in a cage of 18 wire rods. An M8 bolt comes in from outside
each yoke arm, and its nyloc sits on the bearing's inner race, on the drum's
axis, inside the cage. The guide said "reach it between the rods" and listed
13 mm spanners. A typical 165 mm spanner ends 7 mm past the 158 mm rod circle,
so your fingers are between the rods. It fits only straight down the middle
of a gap, a 7 degree window. If the model's hand is 53 mm wide instead of
33 mm, no angle fits. So the step now asks for a 13 mm spanner 200 mm or
longer on the nut, which puts your fingers outside the rods. That triples the
window. The step also says to turn the head outside the arm, where the
spanner swings through 330 degrees.

**The stepper driver's screws were too short.** The feeder's azimuth driver
sits on a printed carrier bolted to the deck. The parts list said four "M3 x
16 screw + nut", going down through the 4 mm block, its 6 mm standoffs and the
5 mm deck. That leaves 1 mm of thread under the deck, and a nut needs 2.4 mm
plus two threads. Those screws were not one of the guide's checked joints. Now
they are, as M3 x 20 with 5 mm past the stack, and a 5.5 mm spanner fits on
the nut under the deck over 205 degrees.

The other eight nut joints pass. The narrowest of them is the
feeder's flight-cap nylocs, which have 15 degrees, but they only need to be
held. Four of the feeder's nuts are not checked yet, because the parts they
clamp are not drawn the way they are built: the idler wheels' bearings, the
turntable bearing's rings, the spring axle and the levelling feet. The
spanner and hand sizes are assumptions, not measurements. The code and every
figure are in
[`ventures/open-tennis-robots/cad`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/open-tennis-robots/cad)
(README, "Spanners on the nuts"). Nobody has built either robot yet.
