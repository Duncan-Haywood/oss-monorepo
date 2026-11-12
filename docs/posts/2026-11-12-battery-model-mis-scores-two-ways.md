---
title: "A reduced battery model gets electrode designs wrong in two ways, and it reports both"
seo_title: "Two ways a reduced battery model mis-scores electrode designs"
date: 2026-11-12
tags: [cell-fidelity, batteries, simulation, multi-fidelity, pybamm]
description: "On five PyBaMM cells, SPMe's errors are salt depletion or a solver stop. Flag both and verify bottom-up: every mis-scored design found, no calibration runs."
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can trust a reduced model (SPMe) instead of the full porous-electrode model (DFN). The trust flag so far is SPMe's own minimum salt ratio, r_min: designs where SPMe's electrolyte runs dry are the ones it under-scores. This morning's step showed the flag's ranking carries over to new cells but its cut-off does not. So what should an engineer do on a cell nobody has tuned for?

We logged two candidate answers and five hypotheses before running anything. The first answer fits a cut-off to 8 DFN runs on random designs. The second skips the cut-off: run DFN on designs in order from the most salt-depleted up, and stop after three sound designs in a row. We tested both on the three cells we already had, then ran 256 new simulations on two cells we had never used, PyBaMM's `Mohtat2020` (graphite/NMC532 pouch) and `NCA_Kim2011` (graphite/NCA pouch).

- **The first new cell broke both answers.** On `Mohtat2020`, SPMe mis-scores 6 of 64 designs, and the salt flag ranks them no better than chance (AUC 0.49). Bottom-up verification found none of them, and the 8-run calibration found one in six on a typical draw. Three of the five hypotheses were refuted outright.
- **The reason was not physics.** All 6 were SPMe runs that stopped part-way, between cycle 3 and cycle 90, with plenty of salt left (r_min 0.65 to 0.89). Rerunning one by hand showed the solver (IDA) failing to converge mid-discharge. PyBaMM handed back the finished cycles as an ordinary solution, so the design scored zero at cycle 100. Before the stop, these runs tracked DFN's energy to within 3.7%.
- **So SPMe goes wrong in two ways, and each shows up in its own run.** Among runs that finish, every mis-scored design on every cell is salt-depleted, and r_min ranks them at AUC 0.995 or better. Runs that stop early are the other way, and you can see that without a DFN run.
- **Flag both and verify bottom-up, and nothing is missed.** With early stops flagged too (a rule we chose after seeing the result, so it still needs its own pre-registered test), bottom-up verification found every mis-scored design on all five cells. It sent 16%, 95%, 6%, 14% and 88% of each pool to DFN, where the mis-scored shares are 13%, 89%, 2%, 9% and 81%.
- **Random calibration was the worse deal everywhere.** Its 8 runs mostly land on sound designs, and the cut-off they give is noisy: on `OKane2022` its recall fell below 0.8 in 8% of draws. It cost more DFN runs than bottom-up verification on every cell.

The second new cell, `NCA_Kim2011`, passed all five hypotheses, but that says less than it seems. SPMe failed outright on 49 of its 64 designs, and the code scores a failed run as fully depleted, so most of the pass comes from that convention.

The practical rule for a cheap-model screen: before you trust a score, check that the run finished. Then rank by how far the salt fell and verify from the bottom. One caveat applies to the whole programme so far: the label counts a solver stop as a mis-score, because that is how a search sees it, but it is a numerical failure, and tighter solver settings may remove it. That is the next thing to test, along with the two-part rule on a sixth cell. All five cells are design-space variants of PyBaMM's parameter sets, not measured cells, with 64 designs on each new one. Code, data and the logged plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
