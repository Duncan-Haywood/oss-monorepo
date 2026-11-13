---
title: "Why the best battery electrode design sits at the salt edge"
date: 2026-11-13
tags: [cell-fidelity, batteries, simulation, pybamm, design-search, pre-registration]
seo_title: "Why is the best Li-ion electrode design at the electrolyte limit?"
description: Split a cell design's 100-cycle energy into thermodynamic energy, utilisation and retention, and the optimum's place at the electrolyte limit falls out. Tested on 192 fresh PyBaMM designs.
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can trust PyBaMM's cheap SPMe model instead of the full DFN model. Its trust test is the electrolyte's salt. If a design's minimum salt concentration drops below 10% of where it started, it gets checked with DFN. The last step found something awkward: the best design in a pool keeps landing right at that threshold. On 21 (cell, current) conditions the best design's closed-form salt number, r_kt, sat between −0.06 and +0.58, while the pools ranged from −3.98 to +0.92. So the designs the cheap model gets wrong are the same ones a search is looking for. This step asked why.

**The score splits three ways.** Every milestone ranks designs by DFN's Wh/kg at cycle 100. That number is exactly the product of three factors:

- **U**, the cell's thermodynamic energy per kg. PyBaMM computes it from the parameter set without simulating anything.
- **Utilisation**, the share of U that the first cycle actually delivers at this current.
- **Retention**, the share of that left at cycle 100.

U and r_kt both come from the parameter set and the design alone. Together they cost 0.3 s per design.

**What we predicted, then ran.** We split the score on the 21 conditions already simulated, and wrote down four predictions before running anything new. Then we ran 389 new simulations: 64 fresh designs, each run through SPMe and DFN, on three conditions picked by r_kt alone. Those were `Ecker2015` at 1.5 times the usual current, `Mohtat2020` at 3 times and `Ai2020` at 0.375 times. All four predictions held:

- Among designs that don't starve their electrolyte, U ranks first-cycle energy at Spearman 0.99, 1.00 and 1.00.
- Among designs that do, r_kt ranks utilisation at 0.82, 0.60 and 0.88. The `Mohtat2020` figure sits exactly at the bar we set.
- Across a pool, U and r_kt pull against each other: −0.82, −0.81 and −0.36. Thicker, denser electrodes store more energy and starve their electrolyte sooner.
- A shortlist built from U and r_kt alone (their Pareto front, with no SPMe run) gets within 0.9%, 4.7% and 2.7% of the best design. It needs 11 to 18 DFN runs out of 64.

**So the optimum sits where the first limit binds.** Above the salt flag utilisation hardly moves (0.85 to 0.96), and U decides the ranking. Below it utilisation falls with r_kt. The best design is the highest-energy one before the salt runs out, which puts it just above the edge: r_kt +0.22 on `Ecker2015` and +0.12 on `Mohtat2020`.

**`Ai2020` is the exception, and it fits the same picture.** On that cell, designs with more energy fade faster: U and 100-cycle retention correlate at −0.94. So fade is the limit that binds first. The best design sits well clear of the edge (r_kt +0.67) and in the bottom third by energy. It is the first of 24 conditions where the best fell outside the range the last step predicted.

**What it costs to skip SPMe.** The SPMe-based procedures from earlier milestones found the exact best on all three pools. They used 15 to 40 DFN runs, plus SPMe on most designs. The front gives up a few percent and runs no SPMe at all. The part it misses is retention, which is the one factor with no closed form here.

**For an electrode designer:** treat r_kt ≈ 0 as a constraint, maximise thermodynamic energy up to it, and spend full-model runs on fade. That is three conditions, one PyBaMM version and stack-level numbers, not a tested cell. In development, `NCA_Kim2011` at half current showed that U alone can mislead where other losses are large. Its utilisation was 0.80 even above the flag.

Plan, verdicts and caveats: [`research/cell-fidelity/LOG.md`](../../research/cell-fidelity/LOG.md). Code and data: `research/cell-fidelity/experiments/edge/`.
