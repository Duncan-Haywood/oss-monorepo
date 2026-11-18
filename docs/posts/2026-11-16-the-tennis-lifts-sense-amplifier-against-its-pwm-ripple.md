---
title: "The tennis lift's sense amplifier against its 20 kHz ripple: the averaged model holds"
seo_title: "Current-sense amplifier vs PWM ripple: does averaging hold?"
date: 2026-11-16
tags: [open-tennis-robots, hardware, electronics, simulation]
description: "A switched 0.25 us simulation of the tennis lift's INA186 sense path: a few mA of ripple, no bias in the mean, 4 us of delay."
---

The open tennis-ball feeder's lift cuts its motor when a ball jams. A shunt
in the motor's + lead feeds an INA186-class current-sense amplifier, then a
10k/100 nF filter, then an LM393 comparator that the ESP32 reads every 10 ms.
[The last change](2026-11-15-the-tennis-lifts-current-sense-moves-inside-the-diode-loop.md)
moved that shunt inside the flyback diode's loop. It left one thing
unchecked. The jam sweep steps its plant at 0.1 ms, feeds the filter the
motor's *mean* current and treats the amplifier as a perfect gain. The real
motor is switched at 20 kHz, so its current is a triangle, and the real
amplifier has a bandwidth, a slew rate and a rail.

**What was run.** A second simulation that switches the MOSFET cycle by
cycle at 0.25 us steps. The diode freewheels with the shunt in the loop both
ways. The amplifier is modelled as a single pole at its datasheet bandwidth
(37 kHz for the 50 V/V part), limited to its 0.3 V/us slew rate and clipped
at its rail. Then come the RC and the comparator. The winding's inductance
is an assumption (2 mH), so it was swept from 0.5 to 4 mH. It covers three
gain and shunt designs and one made-up amplifier ten times slower. An
analytic version of the same thing now sits in the CAD model as a rule.

**What it found.**

- The current's ripple matches the textbook (V + Vd) x D x (1 - D) / (L x f)
  within 2%: 0.19 A peak to peak at half duty on a full pack, 0.11 A at the
  held duty, none at full duty.
- The filter leaves 0.3 to 4.3 mA of it, counted in motor current, at the
  comparator. The trip's own tolerance is 259 mA wide. The comparator's
  9 mV offset alone moves the trip by 18 mA.
- The mean the comparator settles to is off by under 0.005 mA in every case.
  The path is linear, and the steepest ripple edge is 45 times slower than
  the amplifier can slew.
- The amplifier adds 3 to 4 us to a stall's crossing. Even an instant
  stall, the fastest case, takes 320 to 755 us to reach the trip, and the
  firmware only looks every 10 ms. The made-up slow amplifier adds 42 us.
- With no battery reading, a full-duty stall asks for 3.29 V and the output
  stops at about 3.10 V. That is still 3.5 times the highest reference, so it
  trips.
- With no hysteresis, the comparator chatters at 20 kHz while the mean sits
  within about half a milliamp of the trip. A 10 ms reading in that band is a
  coin toss over a few mA. It is not a missed jam.

**What it means.** The shortcut holds, so no part changes. The jam, slip
and duty sweeps stand as they were run. The new rule
(`check_lift_sense_ripple`) catches the designs where averaging would stop
being safe: a 10 us filter lets 86 mA of ripple through, and a 50 uH winding
outruns the slew rate.

**Not measured.** The real winding's inductance, brush commutation spikes,
the amplifier's real swing near its rail, and pickup on the filter node.
The bench step is to scope the amplifier's output and the filter node at
half duty, at the held duty and on a stall.

Code and full tables:
[`ventures/open-tennis-robots/tests/lift_sense_ripple_sweep.py`](../../ventures/open-tennis-robots/tests/lift_sense_ripple_sweep.py)
and
[`eval/lift-sense-ripple-2026-11-16.txt`](../../ventures/open-tennis-robots/eval/lift-sense-ripple-2026-11-16.txt).
These are simulations on assumed motor figures, not measurements of a built
machine.
