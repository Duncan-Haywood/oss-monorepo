---
title: "The tennis feeder learns when its power is really on"
seo_title: "Stepper ENABLE after a precharge: an ESP32 senses the contactor coil"
date: 2026-11-14
tags: [open-tennis-robots, hardware, electronics, firmware]
description: "An opto on the contactor coil lets the tennis feeder hold its stepper off through the precharge: 45 A down to 20 A on assumed figures."
---

Earlier today the open tennis-ball feeder got a precharge: a 4.7 ohm
resistor charges the motor bus for half a second before the e-stop contactor
closes, so the contactor makes about 20 A instead of almost 400. A later run
found that this holds only if nothing starts drawing power while the bus
charges. The shuttle servo did, and the firmware was changed to leave it
unpowered until the first feed. One load was left: the azimuth stepper driver.
Its ENABLE pin was tied to ground, so it held about 8 W of phase current from
the moment it had power. On assumed figures that alone held the bus a few
volts short, and the contactor made about 45 A. In 4 of 27 swept cases (all
with a stiff 20 mOhm pack) it went past the 60 A we allow it.

## One input and one output

The fix needs a way for the ESP32 to know the contactor has closed. The
contactor's coil is driven by an on-delay timer through the e-stop, not by
the board, so the board cannot simply wait for its own command. We put a
PC817 optocoupler's LED across the coil through a 10k resistor (about 2.5 mA
at 29 V), with its transistor pulling GPIO 15 low while the coil is on. The
driver's EN pin, active low on A4988 and TMC2209 boards, now goes to GPIO 5
with a 4.7k pull-up to 3.3 V. So the driver is off while the ESP32 boots, and
off whenever the firmware says so.

Both are strapping pins on the ESP32, the only free ones left on the feeder.
GPIO 5 wants to be high at reset, which the pull-up gives it anyway. GPIO 15
low at reset only silences the boot log, and the coil cannot be on that early:
the timer's half second starts when the e-stop is released. The pin-map test
now checks that GPIO 5 is claimed as an output that starts high and GPIO 15 as
an input.

## Wait for the contacts, not the coil

The opto sees the coil, not the contacts. A small DC contactor's contacts touch
some tens of milliseconds after its coil is energised, then bounce. So the
firmware (`controller.PowerGate`) enables the driver only after the coil has
read on continuously for 150 ms, against an assumed 50 ms pull-in and 10 ms
bounce. The CAD model fails its design check if `CONTACTOR_SETTLE_MS` is
shorter than those two together, and a test fails if the firmware's number and
the model's disagree.

Is bounce itself a problem? We modelled it. While the contacts are open, the
precharge relay is still closed, so the bus does not collapse. It relaxes
toward the pack's voltage less the loads' current times 4.76 ohm, with an 11 ms
time constant. A whole 10 ms bounce leaves a 0.86 V gap, and the re-close makes
11.8 A (5 to 21 A across the sweep). If the driver were already enabled, that
becomes 1.8 V and 24.9 A (11 to 44 A). Neither is over the limit, so bounce
is not an inrush problem while the precharge relay is in place. But enabling
on the coil's first edge would roughly double each re-close, and the settle
time costs nothing.

With the driver held off, nothing starts during the precharge. The contactor
makes 19.6 A at the defaults and 12 to 29 A across all 27 cases, with none
over 60 A.

## What the sense line catches besides

The same input fixes a hole a previous run wrote down. The safety notes ask
for a wireless e-stop fob in series with the contactor's coil. A fob cuts the
coil without touching the mushroom switch the ESP32 reads, so before today the
board did not know its motors had lost power. A ball queued before the cut
could have started the servo during the next precharge. Now a dropped coil
turns ENABLE off at once, halts the board, empties the feed queue and makes the
azimuth home again, because an unpowered stepper holds nothing and the head
may have been pushed. Telemetry carries a new flag, `FLAG_BUS_OFF`, and the
Pi's drill runner aborts on it. On the simulated feeder, which runs the real
firmware, a test cuts the fob after two balls: the drill aborts, the queue is
empty, and no third ball leaves when the fob is released.

## What is still assumed

Every number but the charger's 29.2 V. The contactor's real pull-in and
bounce need a scope on its coil and contacts on the first build. The coil
sense cannot tell a welded or stuck-open contactor from a good one. A
contactor that never closes leaves the driver enabled on the precharged bus,
about 0.3 A through the resistor: harmless, but the head will be weak. The
model and the checks are in `ventures/open-tennis-robots/cad/README.md`,
"Stepper ENABLE after the contactor, and contact bounce", and
`python3 tests/inrush_sweep.py` prints all three tables.

Open Tennis Robots is an open-source (MIT) design for a ball feeder and
collector. No robot has been built yet. Read the safety notes before you build
one. This post is engineering notes on a design, not electrical, safety or
professional advice.
