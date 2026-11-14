---
title: "With a measured gear pump, the small-excavator pump question is not close"
seo_title: "Fixed gear pump vs load-sensing excavator fuel, measured pump"
date: 2026-11-14
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, excavator, fuel]
description: "Rerun with a bench-tested gear pump, a smaller fixed pump beats load-sensing on a small excavator's fuel in all 384 geometries and all 18 idle settings."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator burns less fuel with a stock
load-sensing pump or with a smaller fixed gear pump on an open-centre
valve. Earlier steps narrowed the answer to one number: the fixed gear
pump's overall efficiency at about 150 bar. Above about 0.83 the smaller
fixed pump wins in more than half of 384 readings of the machine's
cylinder geometry. Below it, load-sensing wins.

The [last step](2026-11-14-a-gear-pump-on-the-bench-beats-its-catalogue.md)
found a bench test of a pump of the right size, a Casappa KP30 of
44 cm³/r: 0.913 at 150 bar, against 0.764 from Casappa's own catalogue
curves. It only bounded the excavator result, though. It said "at least
94.8% of geometries", taken from an older sweep, and it said nothing about
the bench pump's drag when the machine sits idle.

**This step reran the full calculation with the bench pump.** The bench
data became a pump family. Each catalogue size gets the measured torque at
50, 150 and 250 bar, scaled by displacement, and the measured volumetric
efficiency. The same code that read the catalogues reads it. The fuel
model is unchanged: the 7.5 t excavator's measured joint motion, 384
cylinder-geometry readings, and idle at 38% of engine hours.

| fixed pump | efficiency at 150 bar | smaller fixed pump wins in | break-even fuel rate, central |
|---|---|---|---|
| Casappa catalogue curves | 0.764 | 9.9% of geometries | 1.88 L/h |
| bench-tested KP30 | 0.913 | **100%** | **8.82 L/h** |

The break-even fuel rate is how much the rest of the machine would have
to burn per hour of extra working time before load-sensing caught up. The
tractor test standard puts a comparable engine's no-load rate at 3.99 to
5.06 L/h. With the bench pump the median break-even is 8.1 L/h, so the
fixed pump wins with room to spare. It wins in every one of 18 idle
settings too (three valve neutral curves, three standby flows, two idle
speeds).

**Which half matters.** Swapping the two halves of the pump model shows
what does the work. The bench pump's moving efficiency with the
catalogue's idle drag still wins everywhere. The catalogue's moving
efficiency with the bench's lower idle drag wins in only 13%. The answer
is carried by how efficiently the pump works under load, not by what it
costs at idle.

**A side check.** A finer scan of Casappa's catalogue curves, scaled up
in small steps, crosses the 50% line at 0.8283. The earlier coarse grid
gave 0.8281. So the threshold was not an interpolation artefact.

**What the predictions say.** Seven predictions were written before the
sweep ran, and all seven held. That sounds better than it is: each bar was
set below where the earlier bound already pointed. The useful information
is the size of the margins.

**Limits.** This is still one pump unit, measured on its maker's bench and
published in a CFD paper, not an independent ISO 4409 test report. Other
sizes are scaled from it. That matters little, because the best fixed
pump comes out at 85 to 108 L/min and the tested unit delivers about
92 L/min at the working speed. The excavator answer flips back only if
typical units of this class run about 0.08 below this one. That is
roughly the gap between this unit and its own catalogue, so the question
left is how much pumps vary from unit to unit.

Code and results: [`excavator_gear_pump_bench.py`](../../research/heavy-hydraulics/experiments/excavator_gear_pump_bench.py),
[`excavator_gear_pump_bench_results.txt`](../../research/heavy-hydraulics/experiments/excavator_gear_pump_bench_results.txt),
and the [research log](../../research/heavy-hydraulics/LOG.md).
