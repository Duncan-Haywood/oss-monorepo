---
title: "A simulator that cuts variance still can't tighten a certified bound"
date: 2026-10-24
description: "Three attempts to certify a robot's mean performance with a biased simulator's help, each valid and each wider than using real trials alone."
tags: [robotics, simulation, sim-to-real, statistics]
---

# A simulator that cuts variance still can't tighten a certified bound

In the `sim2real-inference` research programme, a digital twin used as a control variate raises the effective number of real trials by up to 3.2x on 21 MuJoCo model pairs (within 6% of 1/(1 - rho^2)). A guarantee is a different matter. We tried three distribution-free constructions, all pre-registered in the programme log:

- empirical Bernstein on the control-variate estimand: 2.1 to 3.1 times *wider* than real-only;
- a betting (hedged-capital) interval: 1.9 to 3.4 times wider, because its bets are capped on 99 to 100% of steps;
- a pilot-checked bound on the sim-real discrepancy (milestone 3e): never tighter than real-only empirical Bernstein on any of 21 pairs up to n = 240 real trials.

The third failed for a measurable reason: even at paired correlation 0.87, the largest pilot discrepancy |R - T| stays near 0.3, so Hoeffding on the discrepancy gains nothing, and checking the bound costs 0.056 at n = 240.

All three bounds were valid (coverage 99.5 to 100%). The twin's gain is real for point estimates but hidden from worst-case-range guarantees at these sample sizes. Caveats: one task, model-versus-model pairs, max-based bounds. Real data (SIMPLER paired tables) and binary failure-rate outcomes come next. Details: `research/sim2real-inference/LOG.md`. Written with AI assistance.
