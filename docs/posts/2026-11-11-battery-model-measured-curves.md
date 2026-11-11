---
title: "SPMe or DFN? What two measured battery discharge curves can and cannot tell you"
seo_title: "SPMe vs DFN battery models against measured discharge data"
date: 2026-11-11
tags: [research, batteries, pybamm, simulation, open-source]
description: "PyBaMM SPMe and DFN against measured discharge curves of two cells: the data cannot separate them at low rate; at 2C on one cell DFN fits to 18 mV, SPMe 53."
---

Our [energy-cell-dfn](../../research/energy-cell-dfn/) study found that the fast
single-particle model with electrolyte (SPMe) and the full Doyle-Fuller-Newman
model (DFN) disagree badly on thick, low-porosity electrode designs at high
rate, and traced the disagreement to the electrolyte running out of salt. The
open question was which model a real cell agrees with. So we ran both, plus the
plain single-particle model, against the measured discharge curves that PyBaMM
distributes with two published parameter sets: Ecker et al. (2015), a Kokam
7.5 Ah cell at 1C and 5C, and Ai et al. (2020), an Enertech 2.28 Ah pouch cell
at 0.1C to 2C.

What came out (voltage RMSE against the measurement, isothermal):

- **At low rate the data cannot separate the two models.** At 0.1C and 1C they
  differ by under 1 mV, and each misses the measurement by 40 to 52 mV. That
  error is in the open-circuit curve and the end-of-discharge knee, not in
  the electrolyte physics.
- **At 2C on the Ai cell, DFN wins clearly: 18 mV against 53 mV.** This is the
  case where the electrolyte drops furthest, to 30% of its starting salt. The
  gap between the models grows as the salt runs down: 0.4, 3, 10 and 41 mV at
  97, 84, 67 and 30% of the initial concentration.
- **At 5C on the Ecker cell, neither model fits** (66 and 71 mV), and SPMe is
  slightly closer. There, the thermal model changes the error by 26 mV and the
  mesh by 15 mV, both more than the choice of model.

A practical note for anyone running these comparisons: PyBaMM's default mesh
was not converged at 5C. The error moved from 86 to 71 mV between the default
mesh and four times as many points, while every lower-rate case moved by under
1 mV.

What this does not show: neither measured case reaches the near-empty
electrolyte where SPMe failed on our design candidates, and neither cell is the
LG M50 cell those designs are based on. It supports reading the full model
rather than the reduced one in that region; it does not validate either model
there. The script, data hashes, tests and full table are in the project
directory, and the hypotheses were written down before the run.

Produced with AI assistance (Claude).
