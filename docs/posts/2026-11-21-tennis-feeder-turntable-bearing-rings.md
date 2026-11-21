---
title: "Tennis robots: drawing the turntable bearing's rings showed its nuts had nowhere to go"
seo_title: "Tennis robots: a lazy-susan bearing's screws checked in open CAD"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware]
description: "The ball feeder's lazy-susan was a solid puck in the CAD. Drawn as two rings, it showed its eight screws were too short and its nuts had no room."
---

The open tennis robots' ball feeder aims its launcher head on a turntable. The
turntable turns on a lazy-susan bearing, 150 mm across and 10 mm tall, between
the mast plate and the turntable plate. The CAD drew that bearing as a solid
puck, so the build could not check its eight M5 screws the way it checks every
other bolted joint. The assembly guide said: four M5 x 12 up through the mast
plate with nuts on the fixed ring, and four down through the turntable plate
with nuts under the turning ring.

It is now drawn as a stacked lazy-susan: two 2 mm steel flanges with the race
between them. Each flange has four holes on a 120 mm circle and one 12 mm
access hole. Drawn that way, the guide's version fails three ways.

**The screws were too short.** An M5 x 12 through a 2 mm flange and a 5 mm
plate leaves 5 mm of thread. A plain M5 nut is 4.7 mm high, and the build
wants two threads showing past it, so it needs 6.3 mm.

**The nuts had nowhere to go.** Both sets of nuts sat between the flanges.
That gap is the bearing's 10 mm less two flanges: 6 mm. A nut and the bolt's
tail do not fit in it. And as the turntable turns, the turning ring's nuts
would hit the fixed ring's.

**The turning ring's screws had no way in.** Nothing said how to reach them
once the turntable plate covers the bearing.

The fix turns the joints round. Each screw now has its head in the gap and its
nyloc outside. The fixed ring's screws go down through it and the mast plate,
with nylocs underneath. The turning ring's go up through it and the turntable
plate, with nylocs on top. The screws are M5 x 16, which leaves 9 mm of thread
where 6.6 mm is needed. As the turntable turns, the two sets of 2.75 mm button
heads pass each other 0.5 mm apart. Every head is reached the way a stacked
lazy-susan is normally fitted: through one access hole at a time, turning the
ring between screws. The mast plate gets a 12 mm hole under the fixed ring's
access hole for this. The plate can only turn all the way round before the
gear sector goes on, so the old guide step is now two.

A new check turns the ring to each screw and runs a head-sized cylinder 60 mm
along its axis, past everything already on the machine at that step. All eight
pass. With an 8 mm access hole, all eight fail. A ring spanner and a hand fit on
the nylocs under the mast plate over 95 degrees, next to the azimuth stepper,
and on the ones on the turntable plate over 305 degrees. The nylocs' tails
stand 0.5 mm inside the trunnion cheeks, and a sweep of the head from one
actuator limit to the other never reaches them.

Every bearing dimension is an assumption. Some round lazy-susans are made as
two concentric rings in one plane and mount differently. The parts list now
names the stacked kind and the 6 mm gap it needs. Nobody has built one yet.
The details are in `ventures/open-tennis-robots/cad/README.md`, under "Turntable
bearing's two rings".
