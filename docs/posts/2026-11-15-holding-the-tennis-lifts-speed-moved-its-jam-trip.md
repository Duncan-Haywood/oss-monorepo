---
title: "Holding the tennis lift's speed steady quietly broke its jam detector"
seo_title: "PWM duty compensation vs low-side shunt current trip: a worked case"
date: 2026-11-15
tags: [open-tennis-robots, hardware, firmware, electronics]
description: "Scaling a DC motor's PWM duty to the battery fixed a belt resonance, but a low-side shunt then let a simulated jam go uncut. How we caught and fixed it."
---

The open tennis-ball feeder lifts balls to its hopper on a cleated belt
driven by a small 24 V gearmotor. Earlier today a [string model of the
belt](2026-11-15-the-tennis-lifts-belt-rings-at-the-flight-rate.md) found
that the empty belt's lowest sideways mode, 2.12 Hz, sat inside the band of
rates at which its flights pass a point. The band was wide because the motor
ran at a fixed PWM duty, so the belt's speed followed the battery: 0.91 times
nominal at the 24 V cut with every flight loaded, 1.23 times on a fresh
29.2 V pack with the belt empty. That last case is the run-on after every
ball, which is most of the time the lift runs.

## The obvious fix

The ESP32 already reads the pack through a divider for its regenerative
braking guard. So the lift now drives `duty x min(1, 24 V / reading)`,
with the reading smoothed over half a second and a floor of 0.82. The belt
then runs 0.91 to 1.00 times nominal, the flights pass at 1.61 to 1.78 Hz,
and the 2.12 Hz mode is 14% clear of that band even widened by 5%. None of
the empty belt's first three modes lands in a flight band any more, against
four hits before. A new design rule keeps it that way.

## What it broke

The lift's jam cutoff is a 0.05 ohm shunt in the MOSFET's source, a 1 ms RC
filter and a comparator. A shunt there carries the motor's current only
while the MOSFET is on. During the off time the current flows through the
flyback diode instead. So the filter sees duty times current, and the trip
point in motor amps is the reference divided by the duty. At a duty of 0.82
the trip rises by 22%.

That mattered because of an earlier change. The drive pulley has a friction
slip hub so that a jammed ball meets a sliding clutch instead of the
gearmotor's rotor. A jam then makes the hub slide, and the motor draws the
current that holds the slide torque: 2.30 A at the hub's lowest setting. The
highest trip, at a full pack's held duty, came to 2.44 A.

The jam sweep runs the real firmware against a simulated motor and belt at
0.1 ms steps. Rerun with the battery reading set to each pack, it showed a
jam at 29.2 V **never cut**: 137 J into the winding over six seconds. At the
fixed duty the same jam was cut in 79 ms.

## The fix

The design rules now check every pack at its own duty, with the slip and
stall margins taken at the 0.82 floor, and the slip rule flagged the problem
straight away (0.94 times, 1.1 wanted). Two cheaper fixes were ruled out.
Both DAC pins are already in use, so there was no pin to scale the reference
with the duty. A brief full-duty pulse to check the current would itself
trip the comparator and shake the belt. So the parts changed instead: a
search over the shunt, an E24 divider resistor and the hub's setting
settled on a 2.4k resistor in place of 2.7k and a hub set to 1.0 N m
instead of 0.9. Every lift rule passes. A sliding hub now draws 1.14 times
the highest trip, the lowest trip still leaves 2.14 times the full belt's
torque, and the hub's estimated peak on a flight cap is 124 N against the
cap's 156 N. In the sweep every jam is cut within 79 ms and no start trips.

The margin is thin, so the next item is a current sense that does not
depend on the duty: a high-side amplifier with the shunt inside the
motor-diode loop.

Every motor and friction figure here is an assumption from the CAD
parameters; nothing is built yet. The numbers are in
`ventures/open-tennis-robots/eval/lift-duty-battery-2026-11-15.txt`, and the
write-up is under "Lift duty follows the battery" in the CAD README.
