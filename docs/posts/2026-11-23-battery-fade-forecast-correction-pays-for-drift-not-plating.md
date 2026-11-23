---
title: "A battery cell with no lithium plating settles it: the fade-forecast correction pays for drift"
seo_title: "Fade-forecast correction pays for drift, not plating (PyBaMM)"
date: 2026-11-23
tags: [battery-simulation, pybamm, sei, lithium-plating, research, cell-fidelity]
description: "With plating off and no SEI film resistance, a PyBaMM cell drifts 2.7x off its straight forecast, and the correction cuts DFN cycles per design from 49 to 10."
---

The [cell-fidelity programme](../../research/cell-fidelity/) tries to make battery electrode design
searches cheaper. It runs each candidate design for ten cycles of PyBaMM's full DFN model,
forecasts its lithium loss at cycle 99, and sends only the risky designs on to more cycles. A
correction to that ten-cycle forecast saved about 30 DFN cycles per design on three tuned cells.
All three lost almost all their lithium to plating, and all three drifted a long way from the
straight-line forecast. The paper had two gates for switching the correction on, one on plating
share and one on drift size. On every cell we had, the two gates made the same call, so we could
not tell which one was right.

[Earlier today](2026-11-23-a-battery-cell-that-will-not-fade-without-plating.md) we tried to build
a cell that drifts without plating, and failed. Fast SEI growth thickened the film, the film's
resistance cut every charge short, and lithium loss stalled below 1%. So milestone 7zc changed one
thing, fixed in a plan committed before any run: the SEI film's resistivity set to zero. The film
still eats lithium, but it no longer chokes the charge.

That was enough. The same ladder of SEI diffusivity multipliers now gives a fade that rises
steadily with the multiplier:

| SEI multiplier | lithium lost, cycles 2 to 20 | charge time, cycle 20 / cycle 2 |
|---:|---:|---:|
| 1,000 | 0.36% | 1.00 |
| 10,000 | 1.18% | 1.00 |
| 100,000 | 3.72% (kept: first in the 3 to 20% band) | 0.99 |
| 1,000,000 | 11.06% | 0.79 |

With the film resistance left in, the 100,000 rung had lost 0.84% and its charge time had fallen to
10%. Without it, growth follows the square-root-of-time law textbooks expect. A straight line
through ten cycles of square-root growth over-shoots badly: the median design's cycle-99 loss is
0.365 times what the straight forecast says. That is larger drift than on any plating cell (0.6 to
0.8 there).

On 56 designs run to cycle 100, with five held-out pools:

- **Triage on the straight forecast** meets the accuracy target on 5 of 5 pools, but it barely
  trusts the forecast and spends 49.2 DFN cycles per design.
- **A uniform run length** meets 5 of 5 at 50.0.
- **The honest corrected rule** meets 5 of 5 at **10.0**, 40 cycles per design cheaper than the
  uniform rule on every pool.

The gates disagree here for the first time. Plating share is zero, so the plating gate switches
the correction off on every pool and gives up all 40 cycles. The drift gate switches it on. All
five pre-registered hypotheses held. The upshot for the paper is to gate on drift, not on plating.

Two honest limits. First, this cell is engineered: real SEI has resistance, and with Marquis2019's
own value this cell fails by impedance instead (7zb). It tests the gate's logic, not a cell you
can buy. Second, adding it as an eighth set-condition pulls the drift-gated rule's interval
against triage below zero for the first time (−14.7 cycles per design, set bootstrap −27.7 to
−1.8). But that cell was built to drift, so we report that number and don't count it as a test.
Building that pooling also turned up a bug: two cells sharing the set name `Marquis2019` were
overwriting each other's folds. It is fixed and tested.

Next, the paper's recipe and abstract move to the drift gate. After that comes a resistivity
ladder between zero and the real value, to find where impedance takes over. Code, pre-registration
and results are in [`experiments/sei7zc/`](../../research/cell-fidelity/experiments/sei7zc/results.txt)
and the programme's [research log](../../research/cell-fidelity/LOG.md).

*Written with AI assistance. Simulated cells, not measured ones: `Marquis2019`'s published
parameters with plating off, SEI film resistivity set to zero and SEI solvent diffusivity scaled.*
