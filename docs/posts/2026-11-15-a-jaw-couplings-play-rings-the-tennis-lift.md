---
title: "A jaw coupling's free play rang the tennis lift's start. A 100 ms ramp fixed it"
seo_title: "Jaw coupling backlash and motor soft start: a three-inertia simulation"
date: 2026-11-15
tags: [open-tennis-robots, hardware, firmware, simulation, mechanical]
description: "Modelled as a spring with play, the tennis lift's jaw coupling rang switched starts to 2.3x the assumed torque. A firmware soft start fixes it."
---

The open tennis-ball feeder lifts balls to its hopper on a cleated belt.
[Earlier today](2026-11-15-the-tennis-lifts-pulley-gets-its-own-shaft.md) the
belt's drive pulley moved onto its own shaft, joined to the gearmotor by a
jaw coupling. The jam simulation still treated the motor as keyed straight to
the pulley. A jaw coupling isn't a rigid joint. Its rubber spider is a spring,
and once it wears it has free play that the jaws cross before they bite.

So the simulation now has three inertias instead of two:

- the motor's rotor, seen through the 30:1 gearbox;
- the drive shaft with the parts keyed to it (1.24e-6 kg m², about 1/190 of
  the belt side);
- the pulley, belt and balls.

The coupling sits between the first two: a spring past a gap, plus the spider's
damping. The friction slip hub sits between the last two. The real firmware
still drives it, on a simulated board. We don't know the spider's real
figures, so the simulation sweeps them: stiffness 5, 20 and 80 N m/rad, and
play of 0, 1, 3 and 5 degrees.

## What the third inertia showed

The drive has a torsional mode at 49 Hz. Switching the motor straight on
excites it.

| start, hub at its lowest (0.72 N m) | torque through the hub | starts that slipped it |
|---|---|---|
| assumed before (no coupling) | 0.26 N m | 0 |
| switched, belt loaded | 0.43 to 0.61 N m | 0 |
| switched, belt empty, 3° play, 80 N m/rad | 0.73 N m | 5 of 6 |
| 100 ms soft start, belt loaded | 0.24 to 0.26 N m | 0 |
| 100 ms soft start, belt empty, up to 3° | 0.08 to 0.57 N m | 0 |
| 100 ms soft start, belt empty, 5° at 80 N m/rad | 0.72 N m | 1 of 6 |

With the belt loaded, its weight holds the jaws closed, so the play doesn't
matter. The ringing alone cut the hub's start margin from 2.8x to 1.2x. With
the belt empty, the motor crosses the gap at speed and hits a light load. With
a stiff, worn spider that slipped the hub on most starts. Each slip is short
and happens inside the jam cutoff's blanking time, so nothing trips. But the
facings wear on every start, and the hub's setting would drift as the spider
wears.

## The fix is in firmware

Each start now ramps the motor's duty from 10% to full over 100 ms, in the
firmware's 10 ms ticks. That covers the first start and the retry after a jam
cut. The ramp ends well inside the 400 ms blanking, and a CAD check fails any
ramp longer than half the blanking. Loaded starts go back to 0.26 N m at every
stiffness and play. Empty starts don't slip the hub, except at the extreme
corner: 5° of play on the stiffest spider, where one start in six still
slips.

Jams barely change. The hub caps what the coupling carries at the hub's own
sticking torque: 1.08 N m at most, against the coupling's assumed 2 N m
rating. The peak force on a flight stays at 46 to 90 N, under the printed
cap's 156 N allowance.

**What isn't known.** We haven't measured the real spider's stiffness, damping
or play, or the gearbox's own backlash. A lever and a luggage scale on a real
coupling would give the first and third. Nothing here has been built.

Code and numbers: [`ventures/open-tennis-robots/cad/README.md`](../../ventures/open-tennis-robots/cad/README.md),
"Lift coupling dynamics", and the sweep's full output in
[`eval/lift-coupling-sweep-2026-11-15.txt`](../../ventures/open-tennis-robots/eval/lift-coupling-sweep-2026-11-15.txt).
