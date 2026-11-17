---
title: "The tennis lift's jam sensor stops reading the throttle"
seo_title: "Low-side vs high-side motor current sensing under PWM, in numbers"
date: 2026-11-15
tags: [open-tennis-robots, hardware, electronics, firmware, cad]
description: "A low-side shunt reads duty times current, so the tennis lift's jam trip rose as the duty fell. A shunt inside the diode loop holds it at 1.77 A."
---

The open tennis-ball feeder lifts balls to its hopper on a cleated belt. If a
ball jams, the motor stalls, and a jam cutoff has to switch it off. The cutoff
is a shunt resistor, a 1 ms RC filter and a comparator on GPIO 0. Earlier today
the firmware started holding the lift's speed against the battery, because at
a fixed duty [the belt rang at the flight rate](2026-11-15-the-tennis-lifts-belt-rings-at-the-flight-rate.md)
on a full pack. Now, on a full 29.2 V pack, it runs the motor at 82% duty
instead of 100%.

That broke something quietly. The shunt sat in the MOSFET's source. There it
carries the motor's current only while the MOSFET is on. During the off part
of each PWM cycle the current freewheels through the flyback diode and goes
round the shunt. So the filter averaged duty x current, and the comparator's
trip, counted in motor amps, rose as 1/duty. At 0.82 the highest trip
became 2.20 A. The belt's slip hub, sliding at its weakest, draws 2.52 A. That
is only 1.14 times the trip, and the design wants 1.1. One more notch of duty
floor would have let a jam slide unseen for the whole run-on.

**The fix is where the shunt sits, not what it is.** Put it in the motor's
`+` lead, with the diode's cathode on the motor side of it. Now it is inside
the loop the diode closes, so the motor's current flows through it on and
off, and the reading is the motor's current at any duty. The catch: the shunt
now sits at the pack's voltage, so the comparator can't read it directly.
An INA186-class current-sense amplifier can. TI's datasheet gives its inputs
-0.2 to 40 V common mode whatever its supply, fixed gains from 25 to 500 V/V,
and at most 50 uV of offset and 1% gain error.

**Picking the parts by search, not by eye.** The CAD's parameter model was
rerun over every E24 bottom resistor for the reference divider, shunts of 5,
10 and 20 milliohm, and gains of 25 to 200. Only designs passing every lift
rule were kept, scored by their worst margin. The low-side design scores
1.04. The best high-side ones score 1.29. Chosen: 0.01 ohm, gain 50 (0.5 V per
amp), and a 33k bottom resistor. That trips at 1.64 A, between 1.51 and 1.77 A
over every tolerance, the same at any duty.

| duty floor | high side: highest trip | slide over it | low side: highest trip | slide over it |
| --- | --- | --- | --- | --- |
| 0.6 | 1.77 A | 1.42x | 3.01 A | 0.84x |
| 0.7 | 1.77 A | 1.42x | 2.58 A | 0.98x |
| 0.82 | 1.77 A | 1.42x | 2.20 A | 1.14x |
| 1.0 | 1.77 A | 1.42x | 1.80 A | 1.40x |

**On the simulated feeder** (the real ESP32 firmware driving a plant model of
the motor, belt, slip hub and jammed ball, both packs): no start trips either
design. Every jam is cut, by 49 ms on a full pack and 59 ms on a hot, flat one,
against 79 and 69 ms before. The full pack's trip is lower now. The force on a
flight is unchanged at 86 to 91 N, since the slip hub sets it. The shunt
dissipates 0.43 W at worst instead of 2.1 W.

One check came from GPIO 0 being a strapping pin. The shunt now also carries
the diode's current, so does it hold the pin low at reset? In the plant, a
loaded belt backdriving the motor after a stop puts at most 0.16 A through it,
nine times under the trip.

All of it is a model. Every motor figure is assumed, the amplifier's ripple
response isn't simulated (the plant averages the PWM), and nothing is built.
The bench test is a scope on the amplifier's output during a start, a
hand-held stall and a stop. The numbers and the sweep are in
`ventures/open-tennis-robots/cad/README.md` ("Lift current sense inside the
diode loop") and `eval/lift-sense-high-side-2026-11-15.txt`.

*Written with AI assistance. Not affiliated with Texas Instruments.*
