---
title: "Eight battery cells in one table: gate the fade-forecast correction on drift, not on plating"
seo_title: "Battery fade forecast: gate the correction on drift (8 cells)"
date: 2026-11-24
tags: [battery-simulation, pybamm, research, cell-fidelity, paper]
description: "Table 3 of the cell-fidelity paper gains a plating-free SEI cell, and the fade-forecast correction is now gated on drift size, not on plating."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how few cycles of a full
porous-electrode (DFN) battery simulation an electrode design search needs per design to rank
designs by their cycle-100 lithium loss. Until today the paper's recipe said: run every design
ten cycles, flag the ones likely to drift from their early fade slope and run those to fifty,
and apply a correction to the ten-cycle forecast *only on cells known to be plating-limited*.

The last two experiments undercut that last clause. [Milestone 7zc](2026-11-23-battery-fade-forecast-correction-pays-for-drift-not-plating.md)
built a PyBaMM cell that loses lithium to SEI growth with plating switched off, and the
correction paid there as much as on the plating cells. [Milestone 7zd](2026-11-24-battery-sei-film-resistance-ladder-drift-gate.md)
showed this holds with the SEI film given up to a tenth of its stock resistivity. So this step
rewrote the paper around that, with no new simulation.

## What the table says now

`paper/tables.py` rebuilds Table 3 from the committed fold rows of every experiment, and now
adds the plating-free cell as an eighth set-condition (40 held-out folds in all). It reproduces
the eight-set intervals 7zc and 7zd logged exactly, which is the check that the table is reading
the same rows.

Against drift-score triage alone, in DFN cycles per design, with a bootstrap over the eight cells:

| rule | saving vs triage | 95% interval | folds met |
|---|---|---|---|
| correction, drift-size gate | 14.7 | 1.8 to 27.7 | 36 of 40 |
| correction, out-of-fold error gate | 15.4 | 3.1 to 28.0 | 36 of 40 |
| correction, plating-share gate | 10.5 | &minus;0.1 to 22.2 | 36 of 40 |
| triage alone | reference | | 35 of 40 |

The plating-share gate is the one that fails. On the plating-free cell it reads "no plating"
and switches the correction off on every fold, so that cell runs 49 cycles per design where the
other gates stop it at 10. So the recipe's fourth step now gates on drift size (or on the
out-of-fold error) and drops plating share. Swapping in 7zd's resistive-film cell moves no number
in the table by more than 0.33 cycles.

## What it does not say

Two limits went into the paper alongside the new recipe:

- **The interval excludes zero only because the engineered cell is in it.** With the seven
  earlier cells, no honest gated rule's interval against triage cleared zero. The eighth cell
  was built to drift. That is a fair test of the gate's logic, but it adds no breadth over real
  chemistries.
- **Neither gate checks which way the drift runs.** The drift gate fires when the training
  designs' median |m &minus; 1| is at least 0.10. The four published parameter sets drift that
  far too, but in both directions, so the gate is on there and costs 1.9 to 3.3 cycles per design
  and two held-out folds against triage. "Large drift in one direction" is our reading of where
  the correction pays. Neither gate tests it. A gate on the sign agreement of the per-design drift
  is the obvious next candidate, though it would still correct `NCA_Kim2011`, which drifts one
  way and misses a pool when corrected.

All of this is model-to-model, PyBaMM DFN against PyBaMM DFN. The check against measured cells
is still open. Table: [`paper/tables.txt`](../../research/cell-fidelity/paper/tables.txt);
section 4.7 of [`paper/results.md`](../../research/cell-fidelity/paper/results.md); the
recipe in [`paper/discussion.md`](../../research/cell-fidelity/paper/discussion.md).
