---
title: "Tennis feeder: checking the last unchecked bolts found a crank pin that could not go in"
seo_title: "Tennis feeder: checking shoulder bolts in an open CAD model"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware]
description: "The feeder's assembly guide skipped its shoulder bolts and small screws. Checking them found a nut with 1 mm of room, an eye pin too fat and a cut-away ear."
---

The open tennis-ball feeder's CAD writes its own assembly guide, and the
guide measures every bolted joint against the stack of parts the model puts
under it. Until today it skipped four shoulder bolts, the launcher motors'
screws and the lift's small screws, and said so. Checking them found faults
in five of the seven joints.

**The crank pin could not be fitted.** A servo turns a crank, and a printed
rod joins the crank to the shuttle that feeds each ball. The parts list said
"M4 x 30 shoulder bolt + nyloc" through the crank and the rod. The rod runs
1 mm off the motor plate, so the nyloc had 1 mm to sit in. A 5 mm M4
shoulder bolt also comes with a 5 mm thread, shorter than a nyloc plus two
threads. Now a 6 mm shoulder goes through the crank into a short heat-set
insert in the rod. The crank turns on the shoulder, and the thread ends flush
with the rod's inner face.

**The actuator's pins were the wrong size.** "M6 shoulder bolt" means the
size with an M6 thread, and that size has an 8 mm shoulder. The actuator's
eyes are made for M6, about a 6.3 mm hole, so the shoulder does not go
through. The pins are now the 6 mm shoulder size with an M5 thread. Its
9.5 mm thread leaves 4.5 mm past a 5 mm plate, too little for a nyloc, so
each pin takes a thin nut and threadlocker. Printed sleeves now keep each eye
on the actuator's line. Before, it could slide 20 to 30 mm along a bare
shoulder.

**The anchor's nut hit the guard plate.** The anchor pin's thread and nut
stand 4.5 mm inboard of the cheek, in a 2.5 mm gap. Once the bolt was drawn
in full, the elevation sweep found it cutting into the head's guard plate at
+30 and +45 degrees. The fix is a 13 mm arc slot in the plate's lower rear
edge, on the pin's path around the pivot.

**One lift screw clamped nothing.** The lift motor's printed spacer has a
window for tightening the coupling. It ran through the flange and cut away
the top screw's seat. Both of the spacer's ear screws were also too long for
their insert pockets, and the gearmotor's face screws reached only 2 mm into
its threads. Now the window stops at the flange, and the ear and face screws
are M3 x 8.

The launcher motors' screws passed. 33 joints are measured now, and a test
checks that each old fastener still fails. Some figures are assumptions: the
eye thickness, the motors' thread depths and the catalogue shoulder-bolt
sizes. The design is in
[`ventures/open-tennis-robots/cad`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/open-tennis-robots/cad)
(README, "Shoulder bolts, motor and lift screws"). Nobody has built a feeder
yet.
