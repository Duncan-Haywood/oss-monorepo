---
title: "Correct a ten-cycle battery fade forecast, don't lengthen it"
seo_title: "Correcting a ten-cycle battery fade forecast for lithium plating"
date: 2026-11-20
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "On 200 PyBaMM DFN designs, a ten-cycle forecast bent by the early lithium-loss curve beats a straight 50-cycle look when plating throttles itself."
---

The [last cell-fidelity post](2026-11-20-why-a-ten-cycle-battery-fade-forecast-fails-when-plating-throttles.md)
found why the programme's ten-cycle forecast of lithium loss gets worse on cells with a faster
plating reaction. The plating slows itself over 100 cycles, which bends the loss curve, and a
straight line through the first ten cycles overshoots. A longer look did not help: even at 50
cycles the straight line was worse than the slower cells managed in ten.

That post ended with a remedy to test. Find an early sign of the throttle, inside the first ten
cycles, and use it to bend the forecast. This run tested it on data already on disk (200 designs,
no new simulation), with the hypotheses committed before the numbers were computed
([log, milestone 7u](../../research/cell-fidelity/LOG.md)).

## The early sign was already in the recipe

The candidate was the bend of lithium plated over the first ten cycles: plating in cycles 6 to 10
over plating in cycles 2 to 6, on a log scale. Several steps earlier (milestone 7c) the programme
had defined an observable called O3. It is the same ratio, but on *all* lithium lost, not just
the plated part. On these two cells plating is 99.6 to 99.9% of what they lose, so the two
should match. They do, to within 0.0003 on every one of the 200 designs.

So the question became: does 7c's existing correction, a least-squares line from O3 to the
design's drift, fix the faster cells? Each pool of designs was held out in turn and predicted
from the other four.

| cell | plating multiplier | straight ten-cycle line | ten-cycle line, corrected | straight 50-cycle line (7t) |
|---|---|---|---|---|
| Mohtat2020 | 10 | 0.045 | 0.038 | 0.049 |
| Mohtat2020 | 30 | 0.105 | **0.038** | 0.061 |
| Ecker2015 | 10 | 0.098 | 0.096 | 0.076 |
| Ecker2015 | 30 | 0.249 | **0.072** | 0.131 |

Median error in lithium at cycle 99, |ln(forecast / true)|, held out by pool. The last column is
from the previous step and was not part of this step's plan.

At the faster plating rate the correction removes 64% and 71% of the error. The corrected
ten-cycle forecast beats both the slower cells' straight line and a straight line through 50
cycles. At the slower rate there is little drift to correct, and the gain is small.

## What did not work

The plating-only version never beat the existing correction. At multiplier 30 the two give the
same forecast (medians equal to 0.00002), because the correction already picks O3 on every fold.
At multiplier 10 the correction picks a different observable, the depth of the first cycle's
plating, and the plating bend is a little worse. Putting both bends into one line helped on one
cell and hurt on the other. The two numbers differ by less than 0.0003, so the second slope is
fitting noise.

That is the useful part for anyone running a battery design search with a ten-cycle screen. You
don't need to read plated lithium, which a simulation gives for free and a real cell does not.
The bend of capacity loss over the first ten cycles carries the same signal.

## Limits

Both cells have a plating rate the programme chose so that they fade like the other parameter
sets, so this is PyBaMM's plating law at two rates, not a measured cell. Five folds per cell.
The next step is the one a design search pays for: does the corrected forecast make the triage
rule cheaper than running every design for a fixed number of cycles on these cells? At
multiplier 30 it was 5.5 cycles per design dearer with the straight line.

Code and numbers: [`experiments/bend7u/`](../../research/cell-fidelity/experiments/bend7u/results.txt).
