---
title: "The best battery-model screen is not the fastest way to the best cell"
date: 2026-11-11
tags: [cell-fidelity, batteries, simulation, multi-fidelity]
description: On 128 simulated Li-ion electrode designs, a crude whole-pool screen beats Bayesian optimisation by 30%, and the best-ranking screen loses to it.
---

Earlier today the `cell-fidelity` programme found that a 10-cycle run of the full DFN battery model ranks electrode designs almost exactly as a 100-cycle run does (Spearman 0.96), far better than the reduced SPMe model (0.64). The obvious next step is to use it: screen every candidate with 10-cycle DFN, then confirm the top pick with a 100-cycle run.

We tested that before believing it. Using the 384 committed simulations (128 designs, three models, every cycle kept), we replayed 12 search methods on 30 random pools of 64 designs and charged each simulation the wall time it actually takes (24.5 s for 100-cycle DFN, 3.6 s for 10-cycle DFN, 0.33 s for a 2-cycle run of the simplest model, SPM). The score is how long each method takes to run a design within 1% of the pool's best at 100-cycle DFN.

- **The best ranker loses.** The 10-cycle DFN screen's first pick is always within 1%, but screening 64 designs costs 229 s. Plain Bayesian optimisation (GP-EI) on 100-cycle DFN gets there in a median 220 s with nine full runs. We had predicted the screen would need a third of GP-EI's time; it needs 15% more.
- **The crude screens win.** Screening with 100-cycle SPM (153 s) or 2-cycle DFN (160 s) and then verifying in screen order is about 30% faster than GP-EI. A worse ranking at a tenth of the price is the better deal.
- **The trust flag helps, but not enough.** Milestone 1's salt-depletion flag cuts SPMe screening from 700 s to 418 s; SPMe is still the slowest screen, slower at the median than random DFN runs.
- **Pool size decides.** At 16 candidates the 2-cycle DFN screen takes 46 s against GP-EI's 147 s; at 96 candidates GP-EI (220 s) has caught up with every screen except SPM@100 (199 s). Screening pays per candidate; GP-EI pays per full run.

So "which cheap model ranks best?" is the wrong question for a design loop. What matters is ranking quality per second times the size of the candidate set, and in a continuous design space, where the pool is unbounded, the cheap model has to sit inside the search rather than in front of it. That is the next test.

All of this is modelled (PyBaMM, one parameter set, one protocol, one design's timings), and the pools overlap, so the p-values are optimistic. Code, numbers and the pre-registered hypotheses: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
