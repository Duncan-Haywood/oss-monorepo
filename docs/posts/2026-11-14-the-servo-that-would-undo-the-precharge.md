---
title: "The servo that would have undone the tennis feeder's precharge"
seo_title: "Precharge and constant-power loads: why a robot bus can stall"
date: 2026-11-14
tags: [open-tennis-robots, hardware, electronics, firmware]
description: "A servo seeking home during the precharge would leave the tennis feeder's bus 16 V short, so the contactor would make ~223 A. Now it waits for a feed."
---

Earlier today the open tennis-ball feeder gained a precharge
([the 400 amp click](2026-11-14-the-400-amp-click-when-the-tennis-feeder-switches-on.md)).
When the e-stop is released, a relay charges the motor bus through a 4.7 ohm
resistor, and half a second later a timer closes the main contactor. On
assumed figures that cut the contactor's closing current from 394 A to 20 A.

That model treated everything on the bus as a steady 0.3 A while it charged.
Two of the loads do not behave like that.

## Constant power through a resistor

A buck converter or a chopper stepper driver draws roughly constant power
once its input passes a start threshold. The lower the bus voltage, the more
current it takes. A resistor can only pass so much power into a load: at
most V² / 4R, which for 4.7 ohm is 45 W from a full 29.2 V pack and 30 W at
the 24 V low-battery cut. If the loads ask for more than that, the bus does
not charge. It climbs to the loads' threshold, they start, it collapses, they
stop, and it does the same again.

Two loads on the feeder could start during the half second:

- **The azimuth stepper driver.** Its ENABLE pin is not wired, so it holds its
  phase current, about 8 W at its input, as soon as it has power.
- **The shuttle servo**, on its own 6 V buck. Until this change the firmware
  sent it the "retracted" pulse from power-up. Normally the shuttle is already
  retracted. After an e-stop mid-stroke it is not, so the servo would seek home
  at stall, about 20 W at the input, for most of a second.

## What the model says now

`Feeder.precharge_bus` steps the bus voltage through the half second, with
each load switching on at an assumed 8 V and off at 7 V. Two tests tie it to
known answers. With no loads it matches the closed-form charging curve to
1e-4 of the pack voltage. With one load and a long delay it settles on the
root of the quadratic V (Vpack − V) / R − idle · V = P.

On assumed figures, with the servo seeking:

- **from a full pack** the bus is 7.6 V short when the contactor closes, and
  the contactor makes 104 A;
- **at the low-battery cut** the servo and stepper ask 28 W against the 30 W
  the resistor can pass, less what the idle loads take. The bus chatters at
  8 V, restarting the loads 101 times in half a second. The contactor closes
  across a 16.2 V gap and makes about 223 A, staying over the assumed BMS trip
  for 89 us.

Across the 27 combinations of pack resistance, ESC capacitance and wiring
inductance in `tests/inrush_sweep.py`, the contactor makes 136 to 328 A. Every
case is over the assumed 60 A it may make. The precharge would have done
almost nothing in the case it exists for: switching on again after an e-stop.

## The fix is in the firmware

The shuttle is a slider-crank. Both ends of its stroke are dead centres, so it
does not need a powered servo to stay put. The servo now gets no pulse until
the Pi sends a FEED. The first feed after power-up or a stop runs a back
stroke, because after a power cut the firmware cannot know where the shuttle
stopped. Then comes the forward stroke. The pulse is cut again once each back
stroke ends. A stop cuts it too. The firmware tests check that the gate
gets no pulse before a feed, pulses back first, rests unpowered after the back
stroke and is unpowered after a stop. The simulated drills still release
every ball.

With only the stepper holding, the bus is 2.9 to 3.3 V short at the closing
and the contactor makes 39 to 45 A at the defaults. That is twice the 20 A
the morning's model gave, but under the assumed 60 A. In the sweep it is 28 to
66 A, and four cases, all with a 20 mOhm pack, are over. So the next step is
to wire the stepper's ENABLE to a pin the firmware holds off until the
contactor has closed.

## What is still a guess

The thresholds, hysteresis and soft-start of the real bucks and driver; the
ESCs' own start-up draw; and every figure except the charger's voltage. A
wireless e-stop fob can also cut the coils without the ESP32 seeing it, so a
feed already queued could still start the servo during the next precharge.
Sensing the switched bus would close that gap. The first build should put a
scope on the bus with the e-stop released after a stop mid-stroke.

Code and numbers: `ventures/open-tennis-robots/cad/README.md`, "Start-up loads
during the precharge".
