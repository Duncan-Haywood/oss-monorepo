---
title: "When the tennis feeder slows its wheels, the energy has to go somewhere"
seo_title: "Regenerative braking on a 24 V robot bus: e-stop, full pack, a diode"
date: 2026-11-14
tags: [open-tennis-robots, hardware, electronics, firmware]
description: "Braking ESCs push up to 170 W back onto the tennis feeder's bus; with the contactor open it passes 30 V in under 1 ms. A diode and a firmware rule fix it."
---

The open tennis-ball feeder throws balls between two wheels, each spun by an
e-skate motor through a hobby ESC. Today's earlier runs gave it a power
system: branch fuses, an e-stop contactor, a precharge resistor so the
contactor does not make 400 A when it closes, and a firmware ramp that caps
each wheel's spin-up at 100 W of shaft power. The ramp also works downward:
when a drill asks for a slower shot, the target speed falls at the same
capped power.

That downward ramp was the open question. Most ESCs that take a throttle
signal follow a lower throttle by *braking* (synchronous rectification,
BLHeli's "damped light", a VESC in duty mode). Braking turns the wheel's
kinetic energy back into current on the bus. Each wheel at the drill's top
speed of 6,425 rpm holds about 351 J. Every number below comes from assumed
figures in `cad/otr_cad/params.py`, not from a measurement.

## Three places the energy can go

**Into the pack.** At the ramp's 100 W per wheel and an assumed 85%
recovered, both wheels put at most 170 W on the bus. That is 6.2 A at 27.6 V,
or 5.4 A of charge once the Pi and idle loads take their share. An assumed 15
A BMS charge limit has room for that. The catch is a full pack. At 29.2 V, the
pack's 0.048 ohm (cells, BMS switches, the feed and the main fuse) lifts the
terminal to 29.44 V. With an assumed 0.10 V spread between cells, the highest
cell reaches 3.78 V, past a typical 3.65 V over-voltage cut. The BMS stops
taking charge, and the braking current loses the one place it could go.

**Into a bus the pack has let go of.** Press the e-stop while a wheel is
slowing down. The board sees the contactor's coil drop within a millisecond
(that sensing landed earlier today). The ESC only hears about it on its next
50 Hz pulse, and then it filters its input. We assumed 40 ms in all, less 5 ms
for the contacts to open. That leaves about 6 J going into the bus capacitors
alone: two ESCs' assumed 1,000 uF each plus 300 uF elsewhere. With
C V dV/dt = P, the bus passes 30 V in 0.98 ms from 27.6 V. That is the input
rating of the MDD10A-class H-bridge, the lowest-rated part on the bus. From a
full 29.2 V it takes 0.34 ms. The energy is enough for about 75 V. The
firmware cannot win a race measured in fractions of a millisecond.

**Into a pack that refuses it for some other reason.** Some BMSs block
charging below freezing. The bus rises the same way, and nothing in the
design reacts in time.

## One diode and one rule

The e-stop case has a standard fix. A Schottky diode goes across the
contactor and the precharge relay, with its anode on the switched bus and its
cathode on the pack side, between the main fuse and the contactor. When the
contacts open mid-brake, the diode takes the braking current back to the
pack, and the bus stays near 28.4 V. It conducts only from the bus to the
pack, so the pack still cannot power the motors with the e-stop pressed, and
the precharge works as before. The model asks for a 45 V 20 A class part,
more than 1.5 times the charger's voltage and twice the braking current.

The full-pack case needs a firmware rule. The ESP32 already reads the
battery through a divider on the pack side. It now allows braking only while
that reading is at or under 27,600 mV (3.45 V a cell). At that level the
highest cell reaches 3.58 V while braking. Above it, a lowered target
*coasts*. Getting that right took a second try. The first version let the
ramp follow the wheel's measured speed down, but on the simulated board the
wheel never slowed. A throttle that matches the wheel's speed holds it there
against drag, and any lower throttle is exactly what a braking ESC brakes on.
So in coast mode the board sends zero throttle until the wheel reaches its
new target, and then the speed loop takes over again. A test runs the
simulated feeder at 26.6 V (it brakes) and at 28.2 V (zero throttle until the
wheel arrives, then held at 3,000 rpm). For a BMS with a cold-charge block
there is a switch, `WHEEL_BRAKE = False`, that always coasts.

## What braking is worth, and a safety note

Slowing a wheel by 20% from 6,425 rpm takes 1.3 s on the ramp. Coasting
takes at least 4.7 s. That figure is a lower bound: the assumed 30 W of drag
holds the wheel at top speed, and drag that grows with speed (bearings plus
air) is weaker below it. A test integrates several bearing-and-air mixes and
checks that none coasts faster. On the same bound, a wheel coasting to rest
from top speed takes at least 23 s. Stops and e-stops were already zero
throttle, so the wheels coast after both. `hardware/safety.md` now says so:
watch the wheels stop before reaching into the head, rather than counting on
the e-stop to stop them.

## What is still assumed

Every current and capacitance above is assumed. We have not measured how
hard a real ESC brakes on a lowered throttle, its zero-throttle brake setting,
the drag curve, the contactor's drop-out time or the ESC's response to a
pulse. The first build should scope the bus and log the battery current on a
20% slow-down. The numbers and checks are in the project's `cad/README.md`,
"Regenerative braking", and in the manifest's "regen" line.
