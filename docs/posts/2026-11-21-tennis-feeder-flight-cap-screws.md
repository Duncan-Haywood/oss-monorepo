---
title: "Tennis feeder: the last unchecked screw had a countersink too small for its head"
seo_title: "Tennis feeder: checking a countersunk screw joint in CAD"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware]
description: "The ball lift's 64 flight-cap screws were the last joint the feeder's guide could not measure. Drawing the cleat found a narrow countersink and a loose nut."
---

The open tennis-ball feeder lifts balls up a 2.4 m belt. Each of the belt's
32 flights is a printed cap screwed to a polyurethane cleat that the belt
supplier welds on, with two M3 countersunk screws per cap, 64 in all. The
feeder's CAD writes its own assembly guide and checks every bolted joint
against the stack of parts the model puts under it. These screws were the
last ones it could not check.

**Why it could not.** The belt was drawn as one swept envelope: a solid shell
from the belt's back to the finger tips all the way round the loop, with the
one drawn cap cut out of it. A screw through the cap ran into "belt" for the
next 150 mm, so there was no stack to measure. Now the envelope is cut back
round the drawn cap, and the cleat is drawn there with its two holes. The
guide's stack reader also changed: it now treats each separate piece of a
part as its own interval, where before one bounding box spanned the envelope
above and below the flight. We re-ran all 33 joints that were already checked,
and each reads exactly as it did.

**The countersink was too small for the head.** The cap's countersink was a
cone 6.4 mm across at the face. That works out to an 81 degree cone, where a
screw head is 90 degrees, and an ISO 10642 M3 head can be 6.72 mm across. So
the head stood 0.16 mm proud under the ball and bore on the seat's rim, a thin
line of PETG that the screw's preload would crush. The countersink is now
90 degrees and 6.9 mm across, so the largest head sits 0.09 mm under the face
and bears on the whole cone. The build now fails if a countersink is narrower
than the head, or deeper than the head or half the plate.

**The nut would not have stayed tight.** The parts list said "M3 x 12 + nut".
A plain nut holds by preload. Here it clamps a PU cleat, which creeps under
load, and the cleat bends round both pulleys about three times a minute while
the lift runs. An M3 x 12 leaves 4 mm past the 8 mm of plate and cleat. That
is enough for a plain nut but not for a nyloc, which needs 4 mm plus two
threads. The joint is now an M3 x 14 with a washer on the cleat, which
spreads the load on the PU, and a nyloc, leaving 5.5 mm where 5 is needed.

The screws, washers and nuts now turn round both pulleys with the cap in the
clearance test. They stay inside the belt's envelope and clear of the lift's
other parts. Every fastener on the feeder is now a checked joint: 34 of them.
Two fastener lines on the ball collector are still unchecked, the Raspberry
Pi's M2.5 standoff screws and the ball caster's screws. They are next.

These are design checks, not a build. The cleat's 3 mm thickness and the
screw heads' sizes are catalogue figures, and how fast the PU creeps under a
washer has not been measured. Nobody has built the lift yet. The CAD, the
checks and the assembly guide are in
[`ventures/open-tennis-robots/cad/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/open-tennis-robots/cad)
(cad/README.md, "Flight caps' M3 joint"), MIT licensed.
