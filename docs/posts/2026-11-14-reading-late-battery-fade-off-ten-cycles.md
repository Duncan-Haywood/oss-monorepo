---
title: "Reading late battery fade off the first ten cycles"
date: 2026-11-14
tags: [cell-fidelity, batteries, simulation, pybamm, design-search, capacity-fade, pre-registration]
seo_title: "Can ten DFN cycles predict 100-cycle battery fade in a design search?"
description: "A square-root-of-cycle fade fit over DFN cycles 5 to 10, beside the raw energy, found the best Li-ion design to within 0.16% on three fresh pools."
---

The `cell-fidelity` programme asks how a lithium-ion electrode design search can spend less on PyBaMM's full DFN model without losing the best design. Two steps ago we found a cheap answer for most cells. Run DFN for 10 cycles on every design, then run the top 3 to cycle 100. It failed on one cell, `Ai2020` at low current, where it missed by 6 to 9%. There, the designs that start strongest fade fastest, and the eventual winner can rank 28th at cycle 10.

The last step tried a successive-halving ladder, which keeps more designs alive for longer. It helped, but still missed by 2.7% on one pool. Its write-up asked for a way to see late fade early.

**The idea: fit the fade curve's shape.** In PyBaMM's degradation model the first fade term is growth of the SEI layer, and that grows roughly as the square root of time. So for each design we draw a straight line through its energy at cycles 5 to 10, plotted against √cycle, and read the line at cycle 100. No extra simulation is needed. On its own, this prediction is a poor ranking for some cells. On `NCA_Kim2011` it is anti-correlated with the true result. So the screen keeps both lists. It resumes to cycle 100 the top 4 by raw cycle-10 energy and the top 4 by the extrapolation, which is at most 8 of 64 designs.

**What we predicted, then ran.** We picked this screen on the 30 conditions already simulated, where it was exact on 27 and never more than 0.32% short. Then we wrote down five predictions and committed them before running anything. The test was 192 new DFN runs on three conditions no earlier step had used: `Ai2020` at 0.275 and 0.35 times the usual current, and `NCA_Kim2011` at 1.25 times.

- **The answer (supported).** It came within 0.16% of the best design on all three pools, against a bar of 1%. The plain 10-cycle screen missed the two `Ai2020` pools by 9.2% and 3.9%.
- **The fit sees late fade (supported).** On the two `Ai2020` pools, it ranked the 100-cycle energy at Spearman 0.57 and 0.63, against 0.10 and 0.48 for the raw cycle-10 energy. On `Ai2020` at 0.35×, the best design was 22nd by raw energy and 3rd by the fit.
- **The price (mixed).** It cost 0.24 to 0.32 of running DFN to cycle 100 on everything, against a bar of 0.30. The first ten cycles of every design already cost 15 to 17% of a full run.
- **Against the ladder (mixed).** It was 0.16% worse than the ladder on one pool, 0.39% better on another, and a little more expensive on all three.
- **The hard regime is real (supported).** The raw cycle-10 ranking was weak on both fresh `Ai2020` pools.

**What it means for a designer.** Across all 33 conditions run so far, this screen has never been more than 0.32% from the DFN-best design. The ladder's worst miss is 2.7%, and the plain 10-cycle screen's is 9.2%. Keeping a cheap physics-shaped prediction next to the raw ranking costs almost nothing extra, and it guards against fade that reorders designs late. Both screens cost about a quarter of the full DFN budget. Going much lower needs a way to avoid running every design to cycle 10 at all. One candidate is the zero-simulation front from milestone 5k, used as a first cut. That is the next step.

**Limits.** Three fresh conditions, with 51, 59 and 64 designs after first-cycle solver failures. One PyBaMM version and one machine's timings. The fit's form, window and list size were chosen on earlier data. The fade comes from PyBaMM's models, not from measured cells, so the √cycle law is the model's.

The plan, the outcome and the numbers are in the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
