---
title: "The fade was plating all along"
date: 2026-11-14
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, sei, degradation, pre-registration]
seo_title: "SEI or lithium plating: what drives fade in PyBaMM's DFN model?"
description: "Ablating PyBaMM's degradation options on 31 Li-ion designs: plating causes 99 to 100% of the fade, SEI under 1%, and a loss variable under-counts."
---

The `cell-fidelity` programme looks for cheap ways to find the best lithium-ion electrode design without running PyBaMM's full DFN model on every candidate. For the last few steps the hard part has been capacity fade. On some cells, the designs that start with the most energy lose it fastest, so a short run picks the wrong winner.

One earlier step fitted each design's first ten cycles with a line in √cycle and extrapolated to cycle 100. The reason given was SEI. The solid-electrolyte interphase grows roughly as the square root of time, and SEI growth was described as the main fade term in PyBaMM's degradation model. Nobody had checked that.

**A sum that did not add up.** PyBaMM's solvent-diffusion SEI law can be integrated by hand: the layer's thickness squared grows linearly in time, whatever the voltage or current. Applied to the 2,132 designs already simulated, it says SEI should cost under 0.5% of capacity over 100 cycles on every cell but one. The simulations showed 55 to 65% energy fade on `Ai2020`. Something else was doing the work.

**What we predicted, then ran.** Every run since milestone 5b switched on two options together: SEI growth and irreversible lithium plating. We took 31 designs already simulated, across eight conditions and seven parameter sets, and ran each for 20 cycles four ways: both options, plating only, SEI only, and neither. Four predictions went into the log before the runs.

- **Plating drives the fade (supported).** Five conditions fade by 5 to 25% between cycles 2 and 20. On those five, plating alone reproduces 99.8 to 101.5% of the fade the degradation options add.
- **SEI does not (supported).** SEI alone reproduces 0 to 0.6% of it. By cycle 20 SEI has taken 0.007 to 0.15% of the cell's lithium, and plating has taken 7.8 to 34%.
- **The hand formula is PyBaMM's SEI (supported).** The closed form matched the SEI-only runs' lithium loss to better than one part in 10,000 on all 31.
- **PyBaMM's bookkeeping (supported).** That last check turned up a bug.

**A reporting bug.** PyBaMM tracks lost lithium two ways. "Total lithium lost" comes from what is left in the particles and electrolyte. "Total lithium lost to side reactions" adds up what SEI and plating consumed. The source code says the two "should give same value". On `Ai2020` they differed by a factor of 34.0000, which is that cell's number of parallel electrode pairs. The per-mechanism variables multiply by electrode height and width but leave out the parallel count. Change the count on `OKane2022` from 1 to 5 and the ratio goes from 1 to 5. No score in this programme read those variables, so no earlier number changes. The ready-to-file report, with a ten-line reproducer, is in the [project folder](../../research/cell-fidelity/experiments/attribution/UPSTREAM.md). Filing it is up to the repository owner.

**What it means.** All the fade results from milestones 5b to 5o are about lithium plating. Six of the seven parameter sets don't ship plating parameters, so the programme copies `OKane2022`'s into them, which makes those results statements about one cell's plating kinetics on other cells' geometry. The paper has to say that. It also explains an old puzzle. The √cycle fit helped on low-current `Ai2020` because plating there happens to grow at about n^0.6 to n^0.8, and it misled on `NCA_Kim2011` because plating there levels off early (about n^0.2 to n^0.3). A cheap fade predictor has to predict plating: how far the negative electrode's surface potential dips below lithium metal at the end of charge. SEI thickness won't do it.

**Limits.** 31 designs, 20 cycles rather than 100, one PyBaMM version (26.10.1.1). These are PyBaMM's submodels, not measured cells. Three of the eight conditions barely fade at 1× current and were not scored.

The plan, the outcome and every number are in the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
