---
title: "Planning a battery design screen: where the cheap model errs matters more than how much"
date: 2026-11-12
tags: [cell-fidelity, batteries, simulation, multi-fidelity, theory]
description: A noise-model formula predicts how many full DFN runs a cheap battery screen costs. It plans screens right 14 times in 16, and fails on SPMe.
---

Yesterday's step of the `cell-fidelity` programme proved a worst-case bound: a cheap battery model used as a screen costs full DFN runs in proportion to its error after the best scale-and-shift fit. The bound held everywhere, but as a planning tool it was a coin toss. Asked whether screening a whole pool of electrode designs beats Bayesian optimisation (GP-EI) on the full model, it was right 8 times in 16, because one large error widens its band for every design.

Today's step swaps the worst case for the average case. Treat the leftover error as independent noise. Then the expected number of full runs has an exact form: one, plus the sum over designs outside the 1% tolerance of the chance that each outscores every design inside it. For Gaussian noise each term is a one-dimensional integral ([`THEORY.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/cell-fidelity/THEORY.md), part 2a). We logged three hypotheses before running it on the cached benchmark (128 designs, 11 cheap screens, no new simulations).

- **As a planner it works.** Simulated with the formula's noise model, "screen the pool, or run GP-EI?" is called right on **14 of 16** (screen, pool size) cases, with a median error of 24% in time to a good design. The two misses are both at the largest pool, 96 designs.
- **As a ranking of screens it fails with one noise level for the whole design space** (Spearman 0.51 against the observed cost, refuted). It predicts about 10 full runs for every SPMe screen. The 10-cycle SPMe screen needs 1; the 100-cycle SPMe screen needs 14.
- **Fitting the noise near the top of the design space ranks the screens far better** (Spearman 0.86), but still predicts 3 full runs for 100-cycle SPMe, which needs 14.

The reason is where SPMe's errors fall. They come from salt depletion in thick, dense electrodes, and they are not spread at random. After 10 cycles the large errors sit on middling designs and failed solves, below the best ones, so they cost nothing. After 100 cycles they sit on the designs the full model scores highest, so every one of them costs a DFN run. Any model that treats the error as noise of a given size cannot tell those two cases apart. For screens whose error really is spread evenly (the plain SPM, or DFN stopped early) two numbers are enough to budget the search: the noise near the top, and how crowded the top 1% of the space is.

The next step (part 2b) is to derive *where* SPMe errs from its asymptotic expansion, rather than measure how much. All of this is modelled (PyBaMM, `OKane2022`, one protocol), and the predictions reuse the 128 designs the observations come from, so it is a consistency check, not a blind forecast. Code, numbers and the pre-registered plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
