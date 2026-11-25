---
title: "Strip-theory added resistance on three grids: section shape, not speed, sets the error"
seo_title: "Wigley added-resistance peaks: a strip-theory grid study"
date: 2026-11-24
tags: [research, marine-hull, seakeeping, added-resistance]
description: "Journée's six Wigley I and III added-resistance peaks on three strip grids: up to 4% on Wigley I, under 1.3% on Wigley III; the fit to data holds."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m solar survey boat loses in head seas. It checks two strip-theory added-resistance formulas against Journée's (1992) towing-tank peaks on the slender Wigley I and III hulls at Froude numbers 0.2 to 0.4. One is Gerritsma-Beukelman (GB). The other is a convected near-field pressure integration, NF-PG. Every number in that comparison so far came from one working grid: 16 panels per half section and 30 stations. An earlier step checked that grid at a single point, Wigley I at Fn 0.2, and found it 1% to 2% low. Today's step checked the other five points.

**What ran.** Nothing in the physics changed. We computed both hulls at all three speeds, each peak on three grids: (16, 30), (24, 40) and (32, 60). The expectations were committed before the code. The run took 24 minutes on four cores.

**What came out** ([results](../../research/marine-hull/experiments/results_journee_grid.txt)):

| | Fn 0.2 | Fn 0.3 | Fn 0.4 |
|---|---|---|---|
| Wigley I, GB, (16, 30) to (32, 60) | +1.95% | +2.44% | +2.96% |
| Wigley I, NF-PG | +2.31% | +2.83% | +3.95% |
| Wigley III, GB | +0.85% | +0.60% | +0.46% |
| Wigley III, NF-PG | +1.21% | +1.05% | +0.85% |

- Every peak rises with the grid, at both refinement steps, for both formulas. The coarse grid is low everywhere.
- We expected the error to grow with speed, because a faster hull meets the waves at a higher frequency and the radiated section waves get shorter. That held on Wigley I and was wrong on Wigley III, where the error shrinks with speed. Section shape sets the error, not speed. The one bar we set on size, 3%, failed only on Wigley I at Fn 0.4, which is the point the source itself flags as noisy.
- The two formulas move together: their ratio at each peak changes by under 1%. Across the five clean peaks, the rms of the log ratio to the measurements goes from 0.219 to 0.212 for GB and from 0.229 to 0.226 for NF-PG.
- At Fn 0.2 the model still gives only 0.71 (Wigley I) and 0.79 (Wigley III) of the measured peak on the finest grid. The L/B 10 shortfall the paper discusses is not a grid effect.

**What this does not settle.** Journée's peaks reach us second-hand and only as peak values. We used one damping fit, and the near field's relative-velocity diffraction approximation is untouched. There is no fourth grid, so the finest values are reported as computed, not extrapolated. For any new Wigley I number, (24, 40) is the better working grid.
