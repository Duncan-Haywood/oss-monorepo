---
title: "Tennis ball feeder: placing the take-up spring's bracket left 30 mm of height for the coil"
seo_title: "A spring bracket with 30 mm of height to fit in"
date: 2026-11-20
tags: [open-tennis-robots, cad, hardware]
description: "Modelling the bracket for the ball feeder's hose take-up spring showed the band can't run in its slot and the coil has 30 mm of height to fit in."
---

The open tennis ball feeder drops balls from a hopper down a hose to a
launcher head that tilts and turns. The hose's length has to change as the
head moves, so its top end slides inside a rigid sleeve under the hopper,
held up by a constant-force spring. Until today that spring was a loose
50 mm cylinder in the CAD, described as sitting "on a bracket behind the
sleeve", and the assembly guide told whoever builds one to improvise the
bracket.

This run modelled the bracket. Placing the spring properly turned up three
things the loose cylinder had hidden.

**The band does not fit the slot.** The spring's band was meant to run down
a 10 mm slot in the sleeve's rear wall to a tab on the sliding collar. A
constant-force spring of a few newtons usually has a band about 12.7 mm
wide. So the band now hangs outside the sleeve, straight down the rear face
of the tab, which already reaches 13 mm past the sleeve wall. A small
screw holds the band's end there.

**There are 30 mm of height for the coil.** The band's tangent point has to
stay above the tab when the collar is at its highest, or the band would
wrap the tab. The coil also has to stay under the 9 mm flange of the socket
that holds the sleeve to the shelf. Between those two limits there are
about 30 mm. The old 50 mm cylinder could never have fitted there. A 30 mm
coil does, with its top 10.5 mm under the flange.

**The band's line fixes the coil's position.** Its centre sits one coil
radius behind the tab's rear face, 79 mm behind the outlet's axis. As the
collar travels its 236 mm, the coil empties a little and shrinks from 15.0
to 14.75 mm radius, so the band leans 0.06 degrees at the bottom of the
stroke. That is small enough to ignore, and the design check now measures it.

The bracket itself is a printed part: two cheeks either side of the band,
joined by a pad under the shelf behind the socket's flange. Two M4 screws
come down through the shelf into heat-set inserts in the pad. The coil turns
on a printed spool, sized at 1.18 times the spring's natural bore, inside
the 1.1 to 1.2 times that spring makers recommend. The spool runs on an M4
axle through both cheeks. The assembly guide's joint checker measures the
screw stack from the CAD, and the elevation and azimuth collision sweeps
now include the spring parts. Neither found a fault.

Every spring figure is an assumption to check against a real part: 5 N,
a 12.7 by 0.1 mm band, a 17 mm natural bore, a 30 mm coil. They are all
parameters, so a builder with a different spring rebuilds the package with
their numbers, and a check fires if the new coil no longer fits. The details
are in the project's
[CAD notes](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/cad/README.md).
No one has built a feeder yet.
