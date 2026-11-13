---
title: "Wiring a launcher head that turns and tilts: the obvious cable route had 8 mm of slack and needed 13"
seo_title: "Cable routing for a pan-tilt head: axis twist, loop behind the pivot"
date: 2026-11-13
tags: [ventures, open-tennis-robots, cad]
description: "Cabling a pan-tilt ball launcher: a twist run on the turntable axis, a 376 mm loop behind the pivot, and 20 AWG servo leads instead of 26."
---

The open tennis-ball feeder's launcher head turns about ±30 degrees on a
turntable and tilts from −15 to +45 degrees on a pivot bolt. Until today
nothing in the CAD carried a single wire to it. The head needs 15: six motor
phase wires (the ESCs stay on the base), six tachometer wires, and the
shuttle servo's signal, supply and return. The elevation actuator on the
turntable needs five more.

**Turning is easy if the wires sit on the axis.** The mast and turntable plates
already had 40 mm centre holes. An 11.5 mm bundle rising through them only
twists as the head turns, so it can never swing into a fixed part. The hard
stops let the head reach 36.4 degrees. Clamped 252 mm below the turntable, the
bundle twists at 145 degrees per metre, inside the 180 per metre assumed for
loose wires, and the outer wire stretches 0.01%.

**Tilting is the hard part.** The obvious clip is directly under the pivot,
since that should barely change the cable length. It fails. The turntable is
only 140 mm below the pivot bolt, and the lower launcher wheel is 23 mm above
the bolt. The shortest bundle that fits grows from 106 mm at level to about
119 mm at the actuator's retract limit. Bent no tighter than 10 times the
3 mm phase wire, a 106 mm span holds about 8 mm of slack at most (a
(1 − cos) bump: 19 mm high, 8.4 mm longer). It needs 13.

So the loop goes behind the pivot instead. It runs from a printed gland on the
turntable, straight up, over, and down into a printed clip that slides onto the
head's rear lower standoff. One cut length has to work at every pose, so the
check covers the actuator's whole travel, −30.3 to +45.8 degrees, and not just
the drills' range: a runaway or a hand can put the head anywhere between.
Lengths from 353 to 398 mm fit every pose, so the wire is cut to 376 mm. That
curve is drawn at seven elevations and swept straight ahead and at both hard
stops against every part: no clash. The margin is real but not generous. Wire
stiff enough to need 15 diameters of bend radius, or a clip 30 mm higher, and
no length fits.

**The servo's supply.** The 6 V buck sits on the deck beside the ESP32, so the
servo's return shares the ESP32's ground, 1.71 m away. At an assumed 3 A stall,
a stock 26 AWG servo extension leaves the servo 4.88 V and lifts its ground
0.56 V. The ESP32's 3.3 V signal then arrives as 2.74 V, only 0.34 V over an
assumed 2.4 V input threshold. With 20 AWG the servo gets 5.68 V and a 3.14 V
signal. Torque was never what limited it: even at 26 AWG the servo keeps 2.2
times the 0.78 N m the shuttle needs. The hardware notes had also said a
6-7.4 V BEC, above the roughly 6.8 V these servos are rated for. That now
says a 6 V buck.

Every wire diameter, bend and twist limit, stall current and threshold here is
an assumption. Before building: measure the servo's stall current, check it
still reads a signal with its ground lifted 0.3 V, and bend a real loop through
the actuator's full travel. The checks, parts and package are in
`ventures/open-tennis-robots/cad/` (README, "Cables to the head").
