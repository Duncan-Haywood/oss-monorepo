---
title: "The 400 amp click when the tennis feeder switches on"
seo_title: "Precharge for a DIY robot: ESC inrush, the contactor and the BMS trip"
date: 2026-11-14
tags: [open-tennis-robots, hardware, electronics]
description: "Closing the tennis feeder's e-stop contactor onto empty ESC capacitors would peak near 394 A on assumed figures; a 4.7 ohm precharge cuts it to 20 A."
---

This morning's run sized every fuse on the open tennis-ball feeder and checked
the whole machine against its battery's 30 A limit. It left one question open:
what happens in the first few microseconds after the e-stop contactor closes?

## Why the first microseconds matter

Each launcher motor runs from a hobby ESC. Every ESC has a bank of input
capacitors, often several hundred microfarads to a couple of thousand. With
the e-stop pressed they discharge. When it is released, the contactor joins
a 29.2 V battery (a LiFePO4 pack fresh off its charger) to capacitors at 0 V.
Nothing limits that current but the loop's own resistance and inductance: the
cells, the 12 AWG feed, the fuses, the contacts and the capacitors' ESR.

## The model

The CAD package's power model now treats the closing as a series R-L-C and
solves it in closed form (`Feeder.contactor_inrush` in
`ventures/open-tennis-robots/cad/otr_cad/params.py`). The tests check that
solution against a brute-force RK4 integration in the overdamped, critically
damped and underdamped cases. They also check that the pulse's integral of
i² dt equals C V² / 2R, whatever the damping, because that integral is what
heats a fuse.

Every figure except the charger's 29.2 V is an assumption: a 40 mOhm pack,
1,000 uF per ESC plus 300 uF on everything else, 0.6 uH per metre of feed. On
those figures the loop is 64 mOhm and 0.68 uH, and a direct close:

- peaks at **394 A** about 31 us after the contacts touch, 13 times the
  contactor's 30 A rating;
- stays over an assumed 150 A BMS short-circuit trip for **170 us**, close to
  an assumed 200 us trip delay;
- puts about 15 A²s through the main fuse and under 4 through each ESC fuse,
  which no blade fuse notices.

The fuses are fine. The contacts and the BMS are the problem.

Because the inputs are guesses, `tests/inrush_sweep.py` runs 27 combinations:
pack resistance 20, 40 or 80 mOhm, ESC capacitance 470, 1,000 or 2,000 uF, and
loop inductance 0.3, 0.6 or 1.0 uH per metre. A direct close peaks at 242 to
589 A and stays over 150 A for 84 to 315 us. In 9 of the 27 cases it lasts past
the 200 us delay. All 9 have the 2,000 uF ESCs. A BMS trip there cuts the
Raspberry Pi too, which is the failure the morning's run designed the wiring to
avoid.

## The fix: precharge

The design now charges the bus slowly before the contactor closes. The e-stop
feeds two coils instead of one:

1. a small relay that closes at once and charges the bus through a 4.7 ohm
   resistor. It makes 6.1 A, and the bus's time constant is 11 ms;
2. a 0.5 s on-delay timer module, which then closes the contactor.

After 45 time constants the capacitors are full. What is left is the idle
loads' assumed 0.3 A across the resistor, 1.43 V, so the contactor makes
19.6 A. Across the whole sweep the worst is 29 A. Pressing the e-stop still
drops everything, because both coils run through it.

The resistor takes about 1 J per closing. If something on the bus is shorted,
it takes 181 W for the half second before the contactor closes onto the short
and the fuses open, 91 J in all. The bill of materials asks for an
aluminium-housed resistor rated for that pulse, or one that fails open.

## What the build checks now

The feeder's manufacturing manifest has a new "inrush" line. The build fails if:

- the contactor would make more than an assumed 60 A;
- the current stays over the BMS's trip for longer than its delay;
- the precharge relay makes more than its 10 A.

A test fires each check on a bad value: no precharge, 2,000 uF ESCs with no
precharge, a 20 ms delay, 3 A of idle load, a 2 ohm resistor.

## What it does not know

None of this has been measured. The figures to read off real parts are the
pack's resistance, each ESC's capacitance and the BMS's short-circuit settings.
On the first build, put a current clamp and a scope on the first closing. The
model also leaves out contact bounce (each bounce closes again onto a part-charged
bus) and the bucks' start-up current while the bus rises. Those are next on the
project's list.

The code, the sweep and the wiring notes are MIT licensed in
[`ventures/open-tennis-robots`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/open-tennis-robots).
This is a design study for an unbuilt machine, not electrical advice. Battery
packs can deliver hundreds of amps into a short, so have a qualified person
check your wiring.
