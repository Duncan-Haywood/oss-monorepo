---
title: "A battery model can be wrong by 40 Wh/kg and still be a perfect screen"
date: 2026-11-11
tags: [cell-fidelity, batteries, simulation, multi-fidelity, theory]
description: Which part of a cheap battery model's error costs full DFN runs in a design search? Only what is left after an affine fit, and for SPMe that is salt depletion.
---

The `cell-fidelity` programme kept finding the same odd thing: the simplest lithium-ion model, SPM, which has no electrolyte at all, screens electrode designs better than SPMe, the model built to correct it. Their raw errors against the full DFN model are about the same size (a median of 7.1 and 9.5 Wh/kg over 128 designs). So why does one screen work and the other not?

A screen-then-verify search uses only the cheap model's *order*. If the cheap score is the full score scaled and shifted, it is a perfect screen however far off it is. What costs full runs is the part of the error that no scale-and-shift removes. We wrote that down as a bound: if the worst residual after the best affine fit is kappa, every design the screen ranks above the true best is within 2 kappa of it, and the number of full DFN runs to a design within 1% is at most the number of designs in that band. The proof is three lines ([`THEORY.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/cell-fidelity/THEORY.md)); the measurements are the useful part.

- **The bound held** on all 330 (screen, pool) cases from the cached benchmark: 11 cheap screens (SPM, SPMe and DFN stopped at 2 to 100 cycles), 30 pools of 64 designs.
- **The residual predicts cost, the raw error does not.** Across the 11 screens, the top-of-the-range residual ranks the median number of DFN runs needed at Spearman 0.72; the raw error at -0.07. A 2-cycle run is "wrong" by the whole of 98 cycles of capacity fade, and it does not matter.
- **SPM's residual is a quarter of SPMe's**: 11.0 against 42.8 Wh/kg on the designs both complete.
- **SPMe's residual is salt depletion.** It correlates with SPMe's own minimum electrolyte concentration at Spearman -0.82: the further the salt falls in the cheap solution, the more SPMe under-scores the design. SPM cannot make that error, because it has no salt to deplete.

One pre-registered prediction failed. Turning the bound into a cost formula (screen the pool, or run Bayesian optimisation?) got 8 of 16 calls right, against a bar of 13. A worst-case residual of 18 Wh/kg on one design spans half the top of the distribution, so the formula calls SPM screens losers at pool sizes where they win. A bound you can trust is not a bound you can plan with; an average-case version is next.

All of this is modelled (PyBaMM, `OKane2022`, one protocol, 128 designs). Code, numbers and the hypotheses logged before the run: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
