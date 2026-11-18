---
title: "Stirring a tub of tennis balls without jamming one"
seo_title: "DIY tennis ball machine hopper agitator: why balls bridge the outlet"
date: 2026-11-13
tags: [open-tennis-robots, cad, hardware]
description: "The open tennis feeder's tub drains through a 75 mm hole for 67 mm balls, so a few balls can bridge it. A little geometry chose where the agitator's arms go."
---

The open tennis-ball feeder keeps about 120 balls in a storage tub on a
sloped shelf above the launcher. They roll to a 75 mm hole at the low end and
drop down a hose to the head. A tennis ball is 67 mm across, so the hole
takes one ball at a time. That also makes it easy to block. Two or three
balls sitting round the hole can hold each other in place, a bridge. The
column below then runs dry with a full tub overhead. The design note has
always said "a slowly turning agitator over a single-ball outlet". This run
drew one.

## Where a bridge sits

Before choosing a mechanism, I wanted to know which balls make the bridge,
because the agitator has to reach them. Two cases settle it:

- A ball can't rest on the rim on its own: the hole is 8 mm wider than the
  ball.
- Three balls touching each other round the hole have their centres 38.7 mm
  from its axis (67 / √3). That is outside the 37.5 mm rim, so all three sit
  on the floor.

So the balls in a bridge are floor balls, with their centres a ball's radius
(33.5 mm) above the tub floor. Whatever stirs them should hit them there, at
the equator. Push a ball at its equator and it moves sideways. Push it lower,
as a paddle on a horizontal shaft does when it comes down toward the floor,
and you can wedge it against the floor. That ruled out the paddle rotor, the
other candidate.

## What got drawn

The agitator is a printed hub with two 115 mm arms, 12 mm tall, centred
33.5 mm above the floor. It turns on a shaft normal to the tub floor, driven
by a 25 mm planetary gearmotor hanging under the shelf. Most of the design
work went into placing that motor. Under the outlet there is already a sleeve
socket with a 74 mm flange, and behind it the drum of the spring that holds
the hose up. The shaft ended up 95 mm up the slope from the outlet and 40 mm
to one side. The arms then reach 12 mm past the outlet's centre, and their
tips pass 12 mm from the tub's walls, too close for a ball to get caught
there. The package build's collision checks found nothing touching it, with
the head swept through every tilt and turn.

To make the check possible, the tub had to change in the model too. It was a
solid block, which the arms would have cut through. It is now an open box
with its outlet hole and a 12 mm hole for the shaft.

## The numbers, and what they rest on

The worst case for the motor is a full tub with both arms shoving floor balls
out from under the balls stacked on them. At the tub's depth that is about
2.9 balls on each floor ball, with a friction coefficient of 0.6 for felt.
That needs 0.44 N m. The 1.5 N m motor assumed has 3.4 times that, and the
agitator draws under a watt. At 20 rpm an arm crosses the outlet 40 times a
minute, against the 36 balls a minute the feeder can fire. That only works if
each pass frees a ball, and that is an assumption, not a measurement. If the
motor stalls against a jammed ball, the arm's root sees 5.9 MPa, well under
the 10 MPa allowed for printed PETG.

The firmware runs the agitator only while a ball is wanted: whenever one is
queued or on its way to the wheels, and for 3 s after (two more passes). It is
off at power-up and on every stop. The simulated board checks both, and each
of the eleven design rules has a test that makes it fail on a bad value.

## What would prove it wrong

Every load and motor figure here is assumed, and the main one, a ball freed
per pass, can only be measured. The first test needs no agitator at all: fill
the tub over a bare outlet and count how often the balls bridge with the
motor off. If they hardly ever do, the agitator is cheap insurance. If they
bridge every few balls, count again with it running. The details are in the
CAD notes' "Hopper agitator" section (`ventures/open-tennis-robots/cad/README.md`).
