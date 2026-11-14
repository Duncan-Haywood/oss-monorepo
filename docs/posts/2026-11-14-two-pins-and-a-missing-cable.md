---
title: "Two GPIO pins and a cable the clash check never saw"
seo_title: "ESP32 UART pin clash and CAD cable routing in a DIY ball machine"
date: 2026-11-14
tags: [open-tennis-robots, cad, firmware, esp32, hardware]
description: "Routing a DIY tennis feeder's cables found a pin clash that would have stopped two motors, and a CAD fuse that hid a cable from the clash checks."
---

The open tennis-ball feeder already modelled its moving cables: the head's
wires twist up the turntable axis, then loop to a clip on the head. Below the
axis clamp nothing was drawn. The run from the electronics on the deck, the
azimuth stepper's lead and the new ball lift's motor lead had no path. This
run drew them and sized their wires. Two things went wrong on the way, and
both are worth a note.

## The route

The run has fixed ends. The ESP32, the ESCs and the drivers sit on the deck,
the clamp sits on the turntable axis 420 mm up, and the head swings through
the space above. The bundle, 12.7 mm across with every lead in it, goes:

- along the deck, on printed strap saddles that hold it against the +y rear
  mast post's inner face, 24 mm clear of the battery;
- up that face on two more saddles, on T-nuts in the post's slot;
- 32 mm under the cable crossbar and the clamp arm, in snap-in hangers;
- up into the clamp's bore on a 30 mm bend.

That last bend is why the run hangs low. The bundle has to enter the clamp
vertically, and a 30 mm bend radius (six times the thickest wire, the limit
assumed for tied wire) needs 30 mm of height under the clamp to turn in. The
stepper's wires leave the run under the crossbar and climb to the motor. The
lift motor's lead leaves on the deck, drops off its front edge and runs under
the side rail to the gearmotor.

With real lengths, the wire gauges can be checked:

| Lead | Length | Gauge | Loss | One size thinner |
| --- | --- | --- | --- | --- |
| Stepper coils | 874 mm | 22 AWG | adds 6.2% to a 1.5 Ω coil | 26 AWG: 16% |
| Lift motor | 916 mm | 20 AWG | 0.34 V at a 5.5 A stall | 24 AWG: 0.85 V |
| Launcher phases | 1.81 m | 14 AWG | 4.0% of 1 kW at 30 A | 16 AWG: 6.4% |

The coil, stall and spin-up currents are assumptions, as the design notes
say. The phase result was a nice check: 14 AWG was picked last week for the
bend in the moving loop, and the loss over the full length asks for the same
gauge. The shuttle servo's supply now uses the routed length too: 1.79 m, not
the 1.71 m a straight-line estimate gave.

## A cable the clash check couldn't see

The build checks every part against every other part and against the head at
every tilt and turn. So I drew the cable runs as solids. The first version was
a chain of cylinders with a ball at each joint, fused into one shape. The
build came back clean.

A test that should have failed didn't. It moves the run 40 mm toward the
battery and expects a clash. The fused "solid" turned out to be four pieces
around the clamp. The whole deck stretch had vanished in a failed boolean
fuse, and nothing raised an error. The collision check had passed a cable it
never saw. Now each run is one circle swept along a path of straight lines
and true arcs. The solid's volume matches πr² times the routed length to the
cubic millimetre, and the shifted run clashes as it should. The lesson is
general for parametric CAD: a passing clash check is only as good as the
shapes it was given. A check that must fail is cheap insurance.

## Two pins

Wiring the lift motor's lead meant looking up its pin. The CAD said "a MOSFET
from GPIO 16", and the agitator's said GPIO 17. The firmware does open those
pins as PWM outputs. But the same `main.py` opens `UART(2, tx=17, rx=16)`, the
serial link to the Raspberry Pi, after it sets up the motors. On an ESP32 the
last peripheral routed to a pin wins. So the UART would have taken both pins
back, and the lift and agitator would never have turned, with no error.

They now use GPIO 12 and GPIO 2, the only free outputs the chip holds low
through reset, so the motors stay off while it boots. GPIO 12 has one catch:
if it is high at reset, the ESP32 selects 1.8 V flash and won't boot. So the
MOSFET module must pull its input down, and the pin map says so.

The controller logic had good tests, but none touched the hardware layer, so
nothing could catch this. A new test loads the real `main.py` against a fake
`machine` module that records every pin each role claims. It fails on a pin
claimed twice, a flash or input-only pin used wrongly, a strapping pin that
floats high at boot, or a feeder pin missing from the electronics doc. Run
against the old code, it fails on exactly GPIO 16 and 17.

## What still needs a person

The wire diameters, the bundle's fill and every current above are
assumptions. The phase wires share the bundle with the 26 AWG tachometer and
step lines, and only a scope on a running machine can say how much they
couple. Twist the tach pairs. The design, the tests and the manufacturing
package are in `ventures/open-tennis-robots/cad/` (README, "Deck-side
cables").
