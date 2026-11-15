---
title: "What a kilowatt of gear-pump drag costs a small excavator"
seo_title: "Gear pump no-load drag vs efficiency: a two-number selection rule"
date: 2026-11-15
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, open-centre, excavator, pre-registration]
description: "Each kW of no-load drag at 85 L/min raises the gear-pump efficiency needed to beat load-sensing by about 0.019; a drag-free pump still needs 0.76."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a small excavator should use a smaller fixed gear pump on
an open-centre valve instead of a load-sensing piston pump. Over the last
few milestones, rerun on a measured excavator's joint motion across 384
cylinder geometries, the answer came down to one number: the gear pump's
overall efficiency at 150 bar and 2100 r/min. If it is above about 0.82, the
fixed pump wins on fuel in half the geometries or more.

This morning's run found a second number that matters: the pump's drag when
the valves sit in neutral and the machine idles. Across four measured pump
families it moved the crossing more than the shape of the efficiency map
did. But that estimate came from four averages, and a builder can't size a
pump from "drag matters too". So this run asked how much a kilowatt of drag
is worth.

## What was run

We kept 6u's machinery and changed one thing. The Casappa catalogue's
idle-power curve was multiplied by 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5 and 2,
which is 0 to 7.1 kW at 85 L/min. Each drag level was paired with each of
the four measured efficiency shapes (Casappa, Danfoss and Marzocchi
catalogues, plus a bench-tested Casappa KP30). For each pairing we swept
efficiency and read where the fixed pump starts winning in half the
geometries. Five predictions were committed to the
[log](../../research/heavy-hydraulics/LOG.md) before the sweep ran.

## What came out

| moving shape | no drag | catalogue drag (3.57 kW) | twice | slope per kW |
|---|---|---|---|---|
| Casappa | 0.7647 | 0.8277 | 0.8983 | 0.0187 |
| Danfoss | 0.7607 | 0.8217 | 0.8933 | 0.0185 |
| Marzocchi | 0.7580 | 0.8175 | 0.8833 | 0.0175 |
| bench KP30 | 0.7615 | 0.8216 | 0.8900 | 0.0180 |

- **The slope hardly depends on the pump.** The four slopes lie within 0.0012
  of each other, at about 0.019 of efficiency per kW of no-load drag at
  85 L/min. That works out to roughly 0.0026 per bar of equivalent drag
  pressure.
- **It is nearly, but not quite, a straight line.** We predicted the straight
  line would be off by at most 0.002. It was off by 0.0022 on the Casappa
  shape, with the same slight upward bend on every shape. That prediction is
  refuted, narrowly.
- **A two-number rule does better than one number.** E50 = 0.8277 +
  0.0187 (kW − 3.57) is calibrated on one shape. On the 16 measured
  shape-and-drag cells from 6u, its RMS error is 0.0053, against 0.0066 for
  the single pooled 0.8212. The gain is modest because the measured drags
  only span 2.85 to 3.64 kW. The slope matters most for pumps outside that
  range.
- **Drag can't do it alone.** A pump with no idle drag at all still needs an
  efficiency of about 0.76 before it wins in half the geometries.

## What it means for a builder

Read two numbers off the candidate pump: its overall efficiency at 150 bar,
and its no-load drag at the working speed. A pump that drags a kilowatt less
than the Casappa catalogue needs about 0.81 rather than 0.83. One that
drags a kilowatt more needs about 0.85.

The limits are in the log. The size dependence of the drag is Casappa's,
because we scaled one family's curve. The rule's intercept comes from one
shape, and Marzocchi's shape sits about 0.008 below it. Everything else is
the same model as before: a measured motion record, a published load-sensing
pump map, and catalogue and bench pump data. Nothing here was run on a
machine.

Code and results: `research/heavy-hydraulics/experiments/gear_pump_drag.py`
and `gear_pump_drag_results.txt`.
