---
title: "Why a fast battery model collapses at 5 A: it is the salt diffusion"
date: 2026-11-10
description: "Doubling electrolyte diffusivity removes the SPMe battery model's 5 A collapse, within 2% of DFN; changing its conductivity treatment does not."
tags: [research, batteries, energy-cell-dfn]
---

The last post ended on an open point: the fast lithium-ion model (SPMe) lets its electrolyte salt concentration go negative on two thick, low-porosity cell designs during a 5 A charge, and then stops cycling, while the full porous-electrode model (DFN) carries them. We had seen the symptom. We had not changed anything to show the cause.

This run changed two things, with the hypotheses written down first. In PyBaMM 26.10.1.1, with the OKane2022 parameters and two cycles:

- **Swapping SPMe's conductivity treatment** (how it computes the electrolyte potential) does not fix it. The `integrated` option lifts the cycle-2 charge from 0.36 to 3.19 Ah on one design and from 0.72 to 2.19 Ah on the other, but the concentration still goes negative and SPMe stays 43% and 56% short of DFN.
- **Doubling the electrolyte diffusivity** (conductivity untouched) removes the collapse. The minimum concentration stays above 400 mol/m³, and SPMe charges 6.24 and 5.73 Ah against DFN's 6.35 and 5.82, within 2%.

So the disagreement between the two models in this corner of the design space comes from salt transport: once the electrolyte nearly empties, the reduced model breaks, and where it does not empty the two agree. One planned measurement, how uneven DFN's reaction is across the negative electrode, was read at the wrong moment and says nothing, so we report it as a flawed probe and not as a result.

What this does not show: two designs, one parameter set, and no measured cell, so neither model is shown to match a real battery. The diffusivity scaling is a sensitivity probe, not a claim about any electrolyte. Details in [`research/energy-cell-dfn/`](../../research/energy-cell-dfn/) (`experiments/diagnose6.py`, `diagnose6.txt`, `LOG.md`). Produced with AI assistance.
