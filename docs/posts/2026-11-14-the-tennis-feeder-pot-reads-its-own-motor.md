---
title: "The tennis feeder's position sensor was picking up its own motor"
seo_title: "Actuator pot noise from H-bridge PWM: sizing the ESP32 ADC capacitor"
date: 2026-11-14
tags: [open-tennis-robots, hardware, firmware, esp32, electronics]
description: "The pot wires share a 1.39 m lead with the motor pair. No capacitor: 8% of readings at the rail. 100 nF: 0.55 mm off. 1 uF: 0.055 mm."
---

The open tennis-ball feeder tilts its launcher head with a linear actuator.
The actuator has a feedback potentiometer, and the ESP32 reads it on GPIO 39.
Earlier today a run sized the actuator's lead: five wires, two for the motor
and three for the pot, 1.39 m from the H-bridge on the deck to the actuator.
That run listed one thing it hadn't modelled: "the pot's noise from the motor's PWM
in the same lead (twist the motor pair)". This run modelled it. It turns out
twisting the motor pair doesn't help.

## Why twisting doesn't help

The H-bridge (an MDD10A-class board) drives the motor sign-magnitude: one
pin sets direction, the other is a 20 kHz PWM. So on every edge one motor
wire swings the full pack voltage, up to 29.2 V on a charged LiFePO4 pack,
and the other wire doesn't move. Twisting cancels the field of a pair that
moves in opposite directions. Here only one wire moves, so the pot's wiper
wire beside it picks up the same field however the pair is twisted.

## The model

Each edge pushes a charge V x Cm onto the wiper wire. Cm is the
capacitance between the toggling motor wire and the wiper wire. At an
assumed 30 pF per metre over 1.39 m it comes to about 42 pF. The wiper node
also has capacitance to ground: the filter capacitor on the pin, if there is
one, the pin itself, and the wiper wire's capacitance to the pot's own 3.3 V
and ground wires. The charge leaves through the pot's source resistance,
which for a 10 k pot is 2.5 k at mid-travel. Between edges the error decays
with that RC time constant. In the steady state the error just after each
edge has a closed form. The tests check it against stepping the node edge by
edge.

The pot spans 3.3 V over the 150 mm stroke, so 1 mV is 0.045 mm. The firmware stops
within a 0.5 mm deadband. It calls the actuator jammed if the drive is on and
the reading moves less than 0.5 mm in 0.6 s. That gives three limits: one
reading off by at most half the deadband, the swing between readings under
0.5 mm (or the noise could reset the stall check), and the filter's lag
under a quarter of the deadband.

| Capacitor on GPIO 39 | Step per edge | Worst single reading | Lag at 22 mm/s |
| --- | --- | --- | --- |
| none | 11 V (decays in 0.26 us) | at the rail, 8% of the time | none |
| 100 nF | 12 mV | 0.55 mm | 0.005 mm |
| 1 uF | 1.2 mV | 0.055 mm | 0.054 mm |

Espressif's ADC guide says "users may connect a bypass capacitor (e.g. a
100 nF ceramic capacitor)". On this lead, 100 nF still fails both the
deadband limit and the stall limit. At the assumed values, anything from
220 nF to 2.3 uF passes. 1 uF passes with margin, and it still passes across
the ends of the assumptions we swept: a 2.5 k or 20 k pot, and 10 or 60 pF
per metre between the wires.

## What the firmware got wrong, and what our first fix got wrong

The old firmware took one reading per tick. If that reading fell outside
the calibrated span, it faulted the axis as a broken wire. With no
capacitor, a reading caught on an edge is at the rail, so the head would
fault at random as soon as it moved at part duty.

Now each tick takes eight readings and averages the middle four. A reading
outside the span no longer faults on its own: a wire that's really off reads
off on every tick, so the axis faults on the third such tick in a row
(30 ms).

The first version of that fix stopped the drive on each lost tick. To check
it, we wrote a sweep that runs the real `main.py` and `controller.py` on the
simulated feeder and adds the model's error to every pot reading. We don't
know how long a MicroPython `read_u16()` takes against the 50 us PWM period,
so the sweep tries three read timings: random phases, every reading just
after the rising edge, and every reading just after the falling edge. With
no capacitor and every reading on an edge, a jammed actuator never faulted.
Each lost tick stopped the drive, and each stop restarted the stall timer.
Now lost ticks keep the last duty and count toward the stall time.

After that change the sweep gives these results:

- **1 uF:** every timing settles in 1.8 s within 0.23 degrees, and a jammed
  actuator faults in 0.8 s.
- **No capacitor, old firmware:** it faults every time, a false broken wire.
- **No capacitor, new firmware:** it settles when readings fall at random
  phases. When every reading lands on an edge it faults within 0.2 s, so it
  never drives with a reading it can't use.

## What a builder should check

Fit a 1 uF X7R ceramic capacitor from GPIO 39 to ground at the board. It is
now in the BOM and the pin table. Every capacitance above is an assumption,
and so is the pot's resistance. The real check is a scope on GPIO 39 with the
head moving at part duty. Details, and the list of what isn't modelled, are
in the venture's `cad/README.md` under "The pot's pickup from the motor pair".
