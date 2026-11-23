---
title: "We tried to make a battery cell fade without lithium plating, and its SEI choked itself first"
seo_title: "Can SEI alone fade a PyBaMM cell? It chokes the charge first"
date: 2026-11-23
tags: [battery-simulation, pybamm, sei, lithium-plating, research, cell-fidelity]
description: "With plating off, no SEI rate from 10x to 1,000,000x pushed a PyBaMM cell past 1% lithium loss in 20 cycles: film resistance cut the charge short."
---

The [cell-fidelity programme](../../research/cell-fidelity/) tries to make battery electrode design
searches cheaper. It runs each candidate design for ten cycles of PyBaMM's full DFN model,
forecasts its lithium loss at cycle 99, and sends only the risky designs on to more cycles.
A correction to that ten-cycle forecast saved about 30 DFN cycles per design on three cells.
All three lose 99% of their lithium to plating, and their drift away from the straight-line
forecast is large and one-directional. So we could not tell which of those two facts is the one
that matters. One gate in the paper switches the correction on when plating dominates, and another
when drift is large. On every cell we have, the two gates make the same call.

The obvious test is a cell that drifts without plating. Milestone 7zb tried to build one. We took
`Marquis2019` at twice its rated current, switched plating off, and scaled its SEI solvent
diffusivity by a ladder fixed in advance: 10, 100, 1,000 and on up to 1,000,000. We kept the
smallest rung that made four probe designs lose 3 to 20% of their cyclable lithium between cycles 2
and 20, the band the four committed parameter sets sit in.

No rung passed. Here is what the probe produced (medians over four designs, 20 cycles):

| SEI multiplier | lithium lost, cycles 2 to 20 | growth slope (log-log) | charge time, cycle 20 / cycle 2 |
|---:|---:|---:|---:|
| 1 | 0.00% | 0.95 | 1.00 |
| 100 | 0.10% | 0.73 | 0.99 |
| 10,000 | 0.96% | 0.46 | 0.64 |
| 100,000 | 0.84% | 0.19 | 0.10 |
| 1,000,000 | 0.56% (2 of 4 ran) | 0.05 | 0.26 |

The loss peaks below 1% and then falls. The last column shows why. As the SEI film thickens, its
resistance pushes the cell to its upper voltage cut-off sooner, so each charge step is shorter.
Less charge means less SEI growth, and the loss limits itself. The growth law moves from roughly
linear, through the square-root-of-time shape textbooks expect, to flat. At the top rungs most of
the loss happens in the first cycle, before the measurement window opens. At 1,000,000x two
designs cannot even start.

So under this protocol, a cell whose SEI grows fast enough to matter fails by impedance, not by
running out of lithium. Its lithium-loss forecast is not the number a designer would rank it on.
The pre-registered hypothesis (H362, "some rung passes") is refuted, and the four hypotheses that
needed a kept cell were not run. The paper keeps the plating-share gate as its recipe and now says
plainly that the drift reading is untested.

The next attempt is already clear from the runs. Scale the SEI film's resistivity down along with
its growth rate, so lithium loss can grow without choking the charge, or use a reaction-limited
SEI model. Results, code and the pre-registration are in
[`experiments/sei7zb/`](../../research/cell-fidelity/experiments/sei7zb/results.txt) and the
programme's [research log](../../research/cell-fidelity/LOG.md).

*Written with AI assistance. Simulated cells, not measured ones: `Marquis2019`'s published
parameters with plating off and one SEI parameter scaled.*
