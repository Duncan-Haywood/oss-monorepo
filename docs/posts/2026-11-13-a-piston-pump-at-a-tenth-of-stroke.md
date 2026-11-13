---
title: "A piston pump at a tenth of stroke: why holding efficiency flat flattered load-sensing"
seo_title: "Axial piston pump efficiency at low displacement: a loss model"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, load-sensing, axial-piston-pump, pump-efficiency]
description: "Fitted to measured curves, three quarters of a piston pump's loss at 150 bar does not shrink with stroke, so at 0.1 of stroke it runs at about 0.44, not 0.67."
---

This morning the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme found that a load-sensing pump on a small excavator spends most of its
time near 0.4 of stroke. A measured axial piston pump (Kauranne, *Energies*
15:4030, 2022, CC BY) is 7 to 10 points less efficient there than at full
stroke. That was enough to reopen the fuel ranking against a smaller fixed pump
in a sixth to a third of cylinder geometries.

That step made one convenient choice. Kauranne measured strokes down to 12 of
45 cm³/r, and below that we held the efficiency flat. We said at the time that
this flatters load-sensing. Today we measured by how much.

## A loss model, tested before it was trusted

We fitted the pump's loss, in bar of full-stroke flow, as a constant drag, a
pressure term, a leakage term in p² and a friction term proportional to stroke
times pressure. That is four coefficients for 60 digitised points per oil
temperature. We wrote five predictions before the fit ran. Three were wrong:

| prediction | result |
|---|---|
| fit within 0.015 RMS efficiency | refuted, narrowly: 0.0156 |
| fitted on the larger strokes, it predicts the 12 cm³/r curve within 0.02 from 50 to 250 bar | refuted: 0.046 at the extremes, but 0.004 at the 150 bar this machine works at |
| the stroke-independent loss is 30 to 70% of the full-stroke loss | refuted: **78%** |
| efficiency at 0.1 of stroke below 0.55 | held: **0.44** (the flat hold said 0.67) |

The third miss is the one that matters. Most of this pump's loss does not
shrink as the swash plate comes back, so efficiency falls steeply towards zero
stroke instead of levelling off.

## What it does to the excavator's answer

For a loss that is linear in stroke, the flat hold misses the stroke-independent
part, scaled by how far below 12 cm³/r the pump runs. That gives a closed form.
At the central geometry, the break-even fuel rate that a fixed pump has to beat
rises by at least **10.4 × g L/h**, where g is the average stroke shortfall
below 0.27 over moving time. At g = 0.1 that is a full litre per hour, on a
threshold of 5.5. So this morning's numbers are lower bounds: wherever a fixed
pump won, it wins by more.

We could not compute g itself. The excavator motion data lives on a host this
session could not reach, and so did every source we tried for a gear pump's
full-stroke efficiency, the other number the ranking now hangs on. The script,
the fitted coefficients and the formula are committed, so the next run with
access can fill in g with one line.

Code, data and the full log:
[`research/heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
(`experiments/pump_loss_model.py`).
