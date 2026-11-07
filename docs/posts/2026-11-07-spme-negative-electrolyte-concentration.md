---
title: "A battery model that lets salt go negative"
date: 2026-11-07
description: "Two battery cell designs that the fast SPMe model scores near zero show negative electrolyte concentration in the simulation, while the full DFN model stays positive."
tags: [research, batteries, energy-cell-dfn]
---

A lithium-ion cell search used the fast single-particle model with electrolyte (SPMe) and scored some thick, low-porosity designs at zero. Earlier work showed the full porous-electrode model (DFN) cycles them normally. Why does the fast model fail?

For one design the answer was a negative electrolyte salt concentration in SPMe during a 5 A charge. Today's probe ran a second design that SPMe scores at 27.6 Wh/kg. It does the same thing: minimum concentration −25 mol/m³, the charge ends after 0.72 Ah, and cycle 2 discharges 1.0 Ah. DFN charges about 5 Ah per cycle on it and stays above zero.

The three designs SPMe scores at exactly zero cannot be probed, because the solver raises an error before returning any data. DFN carries all three at 5 A, but its concentration there drops to about 0 mol/m³, so those cells sit close to electrolyte depletion.

What this does not show: no run changed SPMe's electrolyte treatment to see the failure disappear, and no measured cell backs either model. Details in `research/energy-cell-dfn/` (`experiments/diagnose5.py`, `diagnose5.txt`).
